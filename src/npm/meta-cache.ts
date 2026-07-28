/**
 * @file Cached packument fetch — `getPackumentSlim` wires the pure slicer
 *   (`./meta-slice`) to an injectable HTTP adapter and the repo's
 *   `createTtlCache` (memo + cacache persistence + in-flight dedupe via
 *   `getOrFetch`). Every `getPackumentSlim`-backed cache is actually three
 *   `TtlCache` instances sharing one cacache directory (`getCachePeers`): the
 *   primary cache (the object callers hold), a persisted long-TTL last
 *   known-good store (`-stale` prefix, `STALE_TTL_MS`), and a short-TTL
 *   storm-control marker (`-storm` prefix, `STALE_SERVE_TTL_MS`). Three
 *   failure-handling policies layer on top:
 *
 *   - **`force`** bypasses a cached entry EXCEPT when it was written within the
 *     last 30 seconds, so a burst of forced refreshes coalesces into one
 *     upstream fetch instead of hammering the registry. A forced refresh NEVER
 *     removes the existing entry before fetching — on failure, whatever was
 *     cached before the call is untouched, and serve-stale-on-error (below)
 *     still has the persisted last-known-good value to fall back on.
 *   - **Negative caching** is narrow and short: only a definitive HTTP 404
 *     (package/version genuinely absent) is cached, for `NEGATIVE_TTL_MS`, and
 *     only when the persisted stale store holds no known-good data for that
 *     key. A transient error (network failure, 5xx) is NEVER negative-cached,
 *     and a still-fresh negative entry is discarded rather than trusted the
 *     moment known-good data exists in the persisted stale store — a retry
 *     always outranks a cached "not found" over real data.
 *   - **Serve-stale-on-error**: every successful fetch also persists the
 *     `PackumentMetaSlim` to the stale store, independent of the primary
 *     entry's own TTL — `STALE_TTL_MS` (7 days) comfortably outlives it, so the
 *     value survives both the primary entry's expiry and a process restart. If
 *     a later refresh fails for ANY reason — including a fresh 404 — the
 *     persisted value is served instead of propagating the error, and the
 *     storm-control marker is (re)written so a burst of callers within
 *     `STALE_SERVE_TTL_MS` is served without re-hitting a registry that just
 *     failed. ETag revalidation requires a header-capable HTTP adapter; the
 *     current `NpmMetaHttpAdapter` is header-less by design so test doubles and
 *     `httpJson` stay interchangeable with the rest of the npm client surface —
 *     see `NpmMetaHttpAdapter`.
 */

import { createTtlCache } from '../cache/ttl/store'
// no-platform-http-import: server-only module (cacache-backed cache); node platform is intentional.
import { httpJson, HttpResponseError } from '../http-request/node'
import { JSONParse, JSONStringify } from '../primordials/json'
import { URLCtor } from '../primordials/url'
import { slicePackument } from './meta-slice'
import { encodeRegistryName } from './registry'

import type {
  GetPackumentSlimOptions,
  NpmMetaHttpAdapter,
  PackumentMetaSlim,
  PackumentVariant,
  RawPackument,
} from './meta-types'
import type { TtlCache, TtlCacheOptions } from '../cache/ttl/types'

const NPM_REGISTRY = 'https://registry.npmjs.org'

const ACCEPT_ABBREVIATED =
  'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*'
const ACCEPT_FULL = 'application/json'

const CACHE_PREFIX = 'npm-meta'
// 15 minutes.
const DEFAULT_TTL_MS = 15 * 60 * 1000
// A forced refresh younger than this is served from cache instead of
// refetching — coalesces a burst of `force: true` calls.
const FORCE_MIN_AGE_MS = 30_000
// How long a negative (404) cache entry is trusted before a retry is allowed.
const NEGATIVE_TTL_MS = 45_000
// How long the persisted last known-good value survives — well beyond the
// primary entry's own TTL, so it outlives both normal expiry and a process
// restart.
const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000
// Storm-control window: once a key has served stale data, subsequent calls
// within this window are served the same value without re-hitting a
// registry that just failed.
const STALE_SERVE_TTL_MS = 60_000
// Bounded, explicit retry defaults — never inherit an unbounded caller value.
const DEFAULT_RETRIES = 2
const MAX_RETRIES = 5

/**
 * A cached, successfully-fetched packument.
 */
export interface CachedPackumentHit {
  cachedAt: number
  kind: 'hit'
  meta: PackumentMetaSlim
}

/**
 * A cached definitive-404 result — narrow and short-lived (`NEGATIVE_TTL_MS`);
 * see the file-level doc for when this is written.
 */
export interface CachedPackumentMiss {
  cachedAt: number
  kind: 'miss'
  status: number
}

/**
 * The value shape stored per cache key — either a successful fetch or a
 * short-lived negative (404) result.
 */
export type CachedPackumentEntry = CachedPackumentHit | CachedPackumentMiss

/**
 * Thrown by `getPackumentSlim` (and the `getVersions` / `getLatestVersion`
 * exact-version / dist-tag lookups) when a specific package, version, or tag
 * is definitively absent. Carries `status` so `extractHttpStatus` reports it
 * the same way as a real `HttpResponseError`.
 */
export class PackumentNotFoundError extends Error {
  packageName: string
  status: number

  constructor(
    packageName: string,
    status: number,
    message?: string | undefined,
  ) {
    super(
      message ??
        `getPackumentSlim: "${packageName}" not found (registry returned ${status}).`,
    )
    this.name = 'PackumentNotFoundError'
    this.packageName = packageName
    this.status = status
  }
}

/**
 * Build the cache key for one (registry, name, variant) tuple. Normalizes
 * `registry` first (`normalizeRegistryUrl`) so two spellings of the same
 * registry collapse to one key.
 */
export function buildMetaCacheKey(
  registry: string,
  name: string,
  variant: PackumentVariant,
): string {
  return `${normalizeRegistryUrl(registry)}:${name}:${variant}`
}

/**
 * Deep-clone a `PackumentMetaSlim` via a JSON round-trip — plain
 * JSON-roundtrippable data (strings, numbers, booleans, records), so this is
 * 3-5x faster than `structuredClone` and avoids the HTML structured-clone
 * algorithm entirely. Used at every public read boundary so no two callers
 * ever hold a reference to the same cached object.
 */
export function cloneMeta(meta: PackumentMetaSlim): PackumentMetaSlim {
  return JSONParse(JSONStringify(meta)) as PackumentMetaSlim
}

/**
 * Companion long-TTL (persisted stale) and short-TTL (storm-control) caches
 * that back one primary `TtlCache` instance — see the file-level doc.
 */
export interface NpmMetaCachePeers {
  stale: TtlCache
  storm: TtlCache
}

/**
 * Maps a primary cache instance to its persisted-stale + storm-control
 * companions. Keyed by the `TtlCache` instance (not a plain module
 * singleton) so distinct cache instances — e.g. one per test — never see
 * each other's stale/storm data.
 */
const cachePeers = new WeakMap<TtlCache, NpmMetaCachePeers>()

/**
 * Create a dedicated npm-meta cache instance — same `prefix` /
 * default-`ttl` as the module singleton, overridable per-call. Use this (vs.
 * the default singleton) for test isolation or a non-default TTL. Also
 * creates and registers this instance's persisted-stale + storm-control
 * companions (`registerCachePeers`).
 */
export function createNpmMetaCache(
  options?: TtlCacheOptions | undefined,
): TtlCache {
  const opts = { __proto__: null, ...options } as TtlCacheOptions
  const prefix = opts.prefix ?? CACHE_PREFIX
  const cache = createTtlCache({ prefix, ttl: DEFAULT_TTL_MS, ...opts })
  registerCachePeers(cache, prefix)
  return cache
}

/**
 * The uncached fetch attempt for one packument, run through the negative-cache
 * decision: on success, persists the result to `staleCache` and returns a
 * `hit`; on a definitive 404 with no persisted stale data, returns a `miss`
 * (a normal, non-throwing outcome the caller decides how to cache); any other
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
      e instanceof HttpResponseError &&
      e.response.status === 404 &&
      (await staleCache.get<PackumentMetaSlim>(key)) === undefined
    ) {
      return { cachedAt: Date.now(), kind: 'miss', status: 404 }
    }
    throw e
  }
}

/**
 * `GetPackumentSlimOptions` with every field the fetch path needs resolved to
 * a concrete value (defaults applied) — the shape `fetchPackumentSlim` and
 * `getPackumentSlim`'s cache-key logic operate on internally.
 */
export interface ResolvedPackumentFetchOptions {
  http: NpmMetaHttpAdapter
  registry: string
  retries: number
  timeout?: number | undefined
  variant: PackumentVariant
}

/**
 * The uncached fetch — GET the packument with the variant's `Accept` header
 * and slice it. Split out so `getPackumentSlim`'s cache-key / force logic
 * stays readable. Throws (never negative-caches itself — that decision is
 * `getPackumentSlim`'s, which has the context to know whether stale data
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
 * Resolve the persisted-stale + storm-control companions for a primary cache
 * instance, creating them lazily (under the default prefix) for a `TtlCache`
 * that wasn't created via `createNpmMetaCache`.
 */
export function getCachePeers(cache: TtlCache): NpmMetaCachePeers {
  return cachePeers.get(cache) ?? registerCachePeers(cache, CACHE_PREFIX)
}

let defaultMetaCache: TtlCache | undefined

/**
 * The module-level default cache instance, created lazily on first use.
 */
export function getDefaultMetaCache(): TtlCache {
  if (defaultMetaCache === undefined) {
    defaultMetaCache = createNpmMetaCache()
  }
  return defaultMetaCache
}

/**
 * Fetch a package's packument, slice it down to `PackumentMetaSlim`, and
 * cache the result. Concurrent calls for the same (registry, name, variant)
 * dedupe to a single upstream request via the cache's `getOrFetch`. See the
 * file-level doc for the `force` / negative-cache / serve-stale-on-error
 * policies.
 *
 * @throws {PackumentNotFoundError} When the registry returns a definitive 404
 *   and no previously-good data exists for this key to serve instead.
 */
export async function getPackumentSlim(
  name: string,
  options?: GetPackumentSlimOptions | undefined,
): Promise<PackumentMetaSlim> {
  const opts = { __proto__: null, ...options } as GetPackumentSlimOptions
  const cache = opts.cache ?? getDefaultMetaCache()
  const registry = normalizeRegistryUrl(opts.registry ?? NPM_REGISTRY)
  const variant = opts.variant ?? 'abbreviated'
  const retries = Math.min(opts.retries ?? DEFAULT_RETRIES, MAX_RETRIES)
  const key = buildMetaCacheKey(registry, name, variant)
  const { stale: staleCache, storm: stormCache } = getCachePeers(cache)
  const fetchOptions: ResolvedPackumentFetchOptions = {
    http: opts.http ?? { json: httpJson },
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
 * Look up the persisted last known-good value for `key`, if any — backed by
 * `STALE_TTL_MS` (7 days), independent of the primary cache's own TTL, and
 * readable from a fresh process. Returns a fresh clone so no two callers ever
 * share a reference to the same cached object.
 */
export async function getStaleMeta(
  cache: TtlCache,
  key: string,
): Promise<PackumentMetaSlim | undefined> {
  const found = await getCachePeers(cache).stale.get<PackumentMetaSlim>(key)
  return found === undefined ? undefined : cloneMeta(found)
}

/**
 * Normalize a registry base URL so two spellings of the same registry
 * collapse to one cache key and one request URL: lowercase the scheme+host,
 * and ensure exactly one trailing slash. Falls back to the input unchanged
 * when it isn't a parseable absolute URL.
 */
export function normalizeRegistryUrl(registry: string): string {
  try {
    const url = new URLCtor(registry)
    const origin = `${url.protocol}//${url.host}`.toLowerCase()
    const pathname = url.pathname.endsWith('/')
      ? url.pathname
      : `${url.pathname}/`
    return `${origin}${pathname}${url.search}`
  } catch {
    return registry
  }
}

/**
 * Create and register the persisted-stale + storm-control companion caches
 * for `cache` under `prefix`.
 */
export function registerCachePeers(
  cache: TtlCache,
  prefix: string,
): NpmMetaCachePeers {
  const peers: NpmMetaCachePeers = {
    stale: createTtlCache({ prefix: `${prefix}-stale`, ttl: STALE_TTL_MS }),
    storm: createTtlCache({
      prefix: `${prefix}-storm`,
      ttl: STALE_SERVE_TTL_MS,
    }),
  }
  cachePeers.set(cache, peers)
  return peers
}

/**
 * Persist `meta` as the last known-good value for `key`, independent of the
 * primary entry's own TTL/expiry.
 */
export async function rememberStaleMeta(
  cache: TtlCache,
  key: string,
  meta: PackumentMetaSlim,
): Promise<void> {
  await getCachePeers(cache).stale.set(key, cloneMeta(meta))
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
