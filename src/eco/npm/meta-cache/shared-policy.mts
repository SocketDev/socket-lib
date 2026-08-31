/**
 * @file The fetch half of the platform-free packument core — the network call
 *   and the three failure-handling policies layered over it. Split from
 *   `./shared` (which owns the cache plumbing: keys, cloning, the platform
 *   record, and the peer caches) to keep each file inside the 500-line cap and
 *   one concern per file. Both halves are module-internal; neither is a
 *   published subpath.
 *   Every `resolvePackumentSlim`-backed cache is three `TtlCache` instances
 *   sharing one prefix family (`getCachePeers` in `./shared`): the primary
 *   cache callers hold, a persisted long-TTL last known-good store (`-stale`),
 *   and a short-TTL storm-control marker (`-storm`). Three policies layer on:
 *
 *   - **`force`** bypasses a cached entry EXCEPT when it was written within the
 *     last 30 seconds, so a burst of forced refreshes coalesces into one
 *     upstream fetch instead of hammering the registry. A forced refresh NEVER
 *     removes the existing entry before fetching — on failure, whatever was
 *     cached before the call is untouched, and serve-stale-on-error still has
 *     the persisted last-known-good value to fall back on.
 *   - **Negative caching** is narrow and short: only a definitive HTTP 404
 *     (package/version genuinely absent) is cached, for `NEGATIVE_TTL_MS`, and
 *     only when the persisted stale store holds no known-good data for that
 *     key. A transient error (network failure, 5xx) is NEVER negative-cached,
 *     and a still-fresh negative entry is discarded rather than trusted the
 *     moment known-good data exists — a retry always outranks a cached "not
 *     found" over real data.
 *   - **Serve-stale-on-error**: every successful fetch also persists the
 *     `PackumentMetaSlim` to the stale store, independent of the primary
 *     entry's own TTL — `STALE_TTL_MS` (7 days) comfortably outlives it. If a
 *     later refresh fails for ANY reason, including a fresh 404, the persisted
 *     value is served instead of propagating the error, and the storm-control
 *     marker is (re)written so a burst of callers within `STALE_SERVE_TTL_MS`
 *     is served without re-hitting a registry that just failed. A failed
 *     fetch's HTTP status is read STRUCTURALLY (`httpErrorStatus` from
 *     `../registry/live`), never with `instanceof HttpResponseError`. That
 *     error class is platform-specific — the Node and browser `http-request`
 *     twins each declare their own — so an `instanceof` check here would both
 *     drag a platform import into this module and silently fail to recognize a
 *     404 raised by the other twin, or by an injected adapter.
 */

import { slicePackument } from '../meta-slice.mjs'
import { encodeRegistryName } from '../registry/index.mjs'
import { httpErrorStatus } from '../registry/live.mjs'
import {
  buildMetaCacheKey,
  cloneMeta,
  getCachePeers,
  normalizeRegistryUrl,
  NPM_REGISTRY,
  PackumentNotFoundError,
} from './shared.mjs'

import type {
  CachedPackumentEntry,
  NpmMetaPlatform,
  ResolvedPackumentFetchOptions,
} from './shared.mjs'
import type {
  GetPackumentSlimOptions,
  PackumentMetaSlim,
  RawPackument,
} from '../meta-types.mjs'
import type { TtlCache } from '../../../cache/ttl/types.mjs'

const ACCEPT_ABBREVIATED =
  'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*'
const ACCEPT_FULL = 'application/json'

// A forced refresh younger than this is served from cache instead of
// refetching — coalesces a burst of `force: true` calls.
const FORCE_MIN_AGE_MS = 30_000
// How long a negative (404) cache entry is trusted before a retry is allowed.
const NEGATIVE_TTL_MS = 45_000
// Bounded, explicit retry defaults — never inherit an unbounded caller value.
const DEFAULT_RETRIES = 2
const MAX_RETRIES = 5

/**
 * The uncached fetch attempt for one packument, run through the negative-cache
 * decision: on success, persists the result to `staleCache` and returns a
 * `hit`; on a definitive 404 with no persisted stale data, returns a `miss` —
 * a normal, non-throwing outcome the caller decides how to cache. Any other
 * failure (transient error, or a 404 when stale data DOES exist) rethrows so
 * the caller's serve-stale-on-error path can take over.
 */
export async function fetchAndCacheEntry(
  name: string,
  key: string,
  fetchOptions: ResolvedPackumentFetchOptions,
  staleCache: TtlCache,
): Promise<CachedPackumentEntry> {
  try {
    const meta = await fetchPackumentSlim(name, fetchOptions)
    await staleCache.set(key, meta)
    return { cachedAt: Date.now(), kind: 'hit', meta }
  } catch (e) {
    if (
      httpErrorStatus(e) === 404 &&
      (await staleCache.get<PackumentMetaSlim>(key)) === undefined
    ) {
      return { cachedAt: Date.now(), kind: 'miss', status: 404 }
    }
    throw e
  }
}

/**
 * The uncached fetch — GET the packument with the variant's `Accept` header
 * and slice it. Split out so `resolvePackumentSlim`'s cache-key / force logic
 * stays readable. Throws (never negative-caches itself — that decision is
 * `resolvePackumentSlim`'s, which has the context to know whether stale data
 * already exists for this key).
 */
export async function fetchPackumentSlim(
  name: string,
  resolved: ResolvedPackumentFetchOptions,
): Promise<PackumentMetaSlim> {
  const accept = resolved.variant === 'full' ? ACCEPT_FULL : ACCEPT_ABBREVIATED
  const registry = normalizeRegistryUrl(resolved.registry)
  const url = `${registry}${encodeRegistryName(name)}`
  const raw = await resolved.http.json<RawPackument>(url, {
    headers: { Accept: accept },
    retries: resolved.retries,
    timeout: resolved.timeout,
  })
  return slicePackument(raw)
}

/**
 * Fetch a package's packument, slice it down to `PackumentMetaSlim`, and
 * cache the result. Concurrent calls for the same registry, name, and variant
 * dedupe to a single upstream request via the cache's `getOrFetch`. See the
 * file-level doc for the `force` / negative-cache / serve-stale-on-error
 * policies.
 *
 * Each twin re-exports this as `getPackumentSlim` with `platform` bound.
 *
 * @throws {PackumentNotFoundError} When the registry returns a definitive 404
 *   and no previously-good data exists for this key to serve instead.
 */
export async function resolvePackumentSlim(
  platform: NpmMetaPlatform,
  name: string,
  options?: GetPackumentSlimOptions | undefined,
): Promise<PackumentMetaSlim> {
  const opts = { __proto__: null, ...options } as GetPackumentSlimOptions
  const cache = opts.cache ?? platform.getDefaultCache()
  const registry = normalizeRegistryUrl(opts.registry ?? NPM_REGISTRY)
  const variant = opts.variant ?? 'abbreviated'
  const retries = Math.min(opts.retries ?? DEFAULT_RETRIES, MAX_RETRIES)
  const key = buildMetaCacheKey(registry, name, variant)
  const { stale: staleCache, storm: stormCache } = getCachePeers(
    platform,
    cache,
  )
  const fetchOptions: ResolvedPackumentFetchOptions = {
    http: opts.http ?? platform.http,
    registry,
    retries,
    timeout: opts.timeout,
    variant,
  }

  if (opts.force) {
    const cached = await cache.get<CachedPackumentEntry>(key)
    if (
      cached?.kind === 'hit' &&
      Date.now() - cached.cachedAt <= FORCE_MIN_AGE_MS
    ) {
      return cloneMeta(cached.meta)
    }
    // Never remove the pre-existing entry before fetching: it stays exactly
    // as it was unless this fetch succeeds or definitively confirms absence
    // — a failed forced refresh never destroys previously-good data.
    let result: CachedPackumentEntry
    try {
      result = await fetchAndCacheEntry(name, key, fetchOptions, staleCache)
    } catch (e) {
      const stale = await serveStaleOnFailure(staleCache, stormCache, key)
      if (stale !== undefined) {
        return cloneMeta(stale)
      }
      throw e
    }
    await cache.set(key, result)
    if (result.kind === 'miss') {
      throw new PackumentNotFoundError(name, result.status)
    }
    return cloneMeta(result.meta)
  }

  const storming = await stormCache.get<PackumentMetaSlim>(key)
  if (storming !== undefined) {
    return cloneMeta(storming)
  }

  const existing = await cache.get<CachedPackumentEntry>(key)
  if (existing?.kind === 'miss') {
    const stillFresh = Date.now() - existing.cachedAt <= NEGATIVE_TTL_MS
    if (
      stillFresh &&
      (await staleCache.get<PackumentMetaSlim>(key)) === undefined
    ) {
      throw new PackumentNotFoundError(name, existing.status)
    }
    // The miss either aged out, or historically-good data now exists for
    // this key — either way a within-window negative result never gets the
    // final word over a fresh attempt. Discard it and fall through to
    // refetch.
    await cache.delete(key)
  }

  let entry: CachedPackumentEntry
  try {
    entry = await cache.getOrFetch<CachedPackumentEntry>(key, () =>
      fetchAndCacheEntry(name, key, fetchOptions, staleCache),
    )
  } catch (e) {
    const stale = await serveStaleOnFailure(staleCache, stormCache, key)
    if (stale !== undefined) {
      return cloneMeta(stale)
    }
    throw e
  }

  if (entry.kind === 'miss') {
    throw new PackumentNotFoundError(name, entry.status)
  }
  return cloneMeta(entry.meta)
}

/**
 * Serve-stale-on-error: look up the persisted last known-good value and, when
 * found, (re)write the storm-control marker so a burst of callers within
 * `STALE_SERVE_TTL_MS` is served without re-hitting a registry that just
 * failed.
 */
export async function serveStaleOnFailure(
  staleCache: TtlCache,
  stormCache: TtlCache,
  key: string,
): Promise<PackumentMetaSlim | undefined> {
  const priorGood = await staleCache.get<PackumentMetaSlim>(key)
  if (priorGood === undefined) {
    return undefined
  }
  await stormCache.set(key, priorGood)
  return priorGood
}
