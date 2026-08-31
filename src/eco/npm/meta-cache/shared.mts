/**
 * @file Cache plumbing for the platform-free packument core — keys, cloning,
 *   the injected-capability record, and the three-instance peer cache family.
 *   The fetch call and its failure policies live in `./shared-policy`; both
 *   halves are module-internal, neither is a published subpath.
 *   Nothing here reaches a `node:` builtin, which is what lets `./node` and
 *   `./browser` be a true twin pair rather than a Node module with a
 *   browser-shaped wrapper.
 *   The two things a packument fetch cannot do without are a way to make an
 *   HTTP request and a way to persist a cache entry, and both are exactly the
 *   things a browser and a server disagree about. They are therefore INJECTED
 *   as `NpmMetaPlatform`, and each twin supplies its own pair: `./node` binds
 *   `httpJson` from `../../http-request/node` and the cacache-backed
 *   `createTtlCache`, `./browser` binds `httpJson` from
 *   `../../http-request/browser` and the storage-adapter-backed
 *   `createBrowserTtlCache`.
 */

import { JSONParse, JSONStringify } from '../../../primordials/json.mjs'
import { URLCtor } from '../../../primordials/url.mjs'

import type {
  NpmMetaHttpAdapter,
  PackumentMetaSlim,
  PackumentVariant,
} from '../meta-types.mjs'
import type { TtlCache, TtlCacheOptions } from '../../../cache/ttl/types.mjs'

export const NPM_REGISTRY = 'https://registry.npmjs.org'

export const CACHE_PREFIX = 'npm-meta'
// 15 minutes.
export const DEFAULT_TTL_MS = 15 * 60 * 1000
// How long the persisted last known-good value survives — well beyond the
// primary entry's own TTL, so it outlives both normal expiry and a process
// restart.
const STALE_TTL_MS = 7 * 24 * 60 * 60 * 1000
// Storm-control window: once a key has served stale data, subsequent calls
// within this window are served the same value without re-hitting a
// registry that just failed.
const STALE_SERVE_TTL_MS = 60_000

/**
 * A cached, successfully-fetched packument.
 */
export interface CachedPackumentHit {
  cachedAt: number
  kind: 'hit'
  meta: PackumentMetaSlim
}

/**
 * A cached definitive-404 result — narrow and short-lived; see
 * `./shared-policy`'s file doc for when this is written.
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
 * Companion caches that back one primary `TtlCache` instance: a long-TTL
 * persisted-stale cache and a short-TTL storm-control cache.
 */
export interface NpmMetaCachePeers {
  stale: TtlCache
  storm: TtlCache
}

/**
 * The two capabilities this module refuses to import for itself, supplied by
 * whichever twin the consumer resolved. Keeping them in one record means a
 * shared function takes a single extra parameter rather than one per
 * capability, and a test can drive the entire policy surface with a plain
 * object.
 */
export interface NpmMetaPlatform {
  /**
   * Builds a `TtlCache`. `./node` passes cacache-backed `createTtlCache`;
   * `./browser` passes `createBrowserTtlCache`.
   */
  createCache(options?: TtlCacheOptions | undefined): TtlCache
  /**
   * The twin's lazily-created module singleton, used when a caller passes no
   * `options.cache`. A method rather than a value so the singleton stays lazy,
   * and owned by the twin rather than this module so a Node cache and a
   * browser cache can never collide in one process.
   */
  getDefaultCache(): TtlCache
  /**
   * The default HTTP adapter, used when a caller passes no `options.http`.
   */
  http: NpmMetaHttpAdapter
}

/**
 * `GetPackumentSlimOptions` with every field the fetch path needs resolved to
 * a concrete value with defaults applied — the shape `fetchPackumentSlim` and
 * `resolvePackumentSlim` operate on internally.
 */
export interface ResolvedPackumentFetchOptions {
  http: NpmMetaHttpAdapter
  registry: string
  retries: number
  timeout?: number | undefined
  variant: PackumentVariant
}

/**
 * Thrown by `resolvePackumentSlim` (and the `getVersions` / `getLatestVersion`
 * exact-version / dist-tag lookups) when a specific package, version, or tag
 * is definitively absent. Carries `status` so `extractHttpStatus` reports it
 * the same way as a real HTTP error.
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
 * Maps a primary cache instance to its persisted-stale + storm-control
 * companions. Keyed by the `TtlCache` instance (not a plain module
 * singleton) so distinct cache instances — e.g. one per test — never see
 * each other's stale/storm data.
 */
const cachePeers = new WeakMap<TtlCache, NpmMetaCachePeers>()

/**
 * Build the cache key for one registry/name/variant tuple. Normalizes
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
 * Deep-clone a `PackumentMetaSlim` via a JSON round-trip. The payload is plain
 * JSON-roundtrippable data: strings, numbers, booleans, and records. That
 * makes this 3-5x faster than `structuredClone` and avoids the HTML
 * structured-clone algorithm entirely. Used at every public read boundary so
 * no two callers ever hold a reference to the same cached object.
 */
export function cloneMeta(meta: PackumentMetaSlim): PackumentMetaSlim {
  return JSONParse(JSONStringify(meta)) as PackumentMetaSlim
}

/**
 * Create a dedicated npm-meta cache instance — same `prefix` /
 * default-`ttl` as a twin's module singleton, overridable per-call. Also
 * creates and registers this instance's persisted-stale + storm-control
 * companions (`registerCachePeers`).
 */
export function createNpmMetaCache(
  platform: NpmMetaPlatform,
  options?: TtlCacheOptions | undefined,
): TtlCache {
  const opts = { __proto__: null, ...options } as TtlCacheOptions
  const prefix = opts.prefix ?? CACHE_PREFIX
  const cache = platform.createCache({
    prefix,
    ttl: DEFAULT_TTL_MS,
    ...opts,
  })
  // Forward the caller's options to the peers as well, so a browser cache
  // given a `storage` adapter persists its last-known-good and storm-control
  // tiers too. Serve-stale-on-error is the tier that most needs to outlive a
  // page load; peers built from `{ prefix, ttl }` alone would be memo-only and
  // silently lose it. `prefix` and `ttl` are re-set per peer inside
  // `registerCachePeers`, so passing them here is harmless.
  registerCachePeers(platform, cache, prefix, opts)
  return cache
}

/**
 * Resolve the persisted-stale + storm-control companions for a primary cache
 * instance, creating them lazily under the default prefix for a `TtlCache`
 * that wasn't created via `createNpmMetaCache`.
 */
export function getCachePeers(
  platform: NpmMetaPlatform,
  cache: TtlCache,
): NpmMetaCachePeers {
  return (
    cachePeers.get(cache) ?? registerCachePeers(platform, cache, CACHE_PREFIX)
  )
}

/**
 * Look up the persisted last known-good value for `key`, if any — backed by
 * `STALE_TTL_MS` (7 days), independent of the primary cache's own TTL. Returns
 * a fresh clone so no two callers ever share a reference to the same cached
 * object.
 */
export async function getStaleMeta(
  platform: NpmMetaPlatform,
  cache: TtlCache,
  key: string,
): Promise<PackumentMetaSlim | undefined> {
  const found = await getCachePeers(
    platform,
    cache,
  ).stale.get<PackumentMetaSlim>(key)
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
 *
 * `options` is the primary cache's own configuration, forwarded verbatim so
 * platform-specific fields a twin understands but this module does not — the
 * browser store's `storage` adapter, for instance — reach the peers too. Each
 * peer's own `prefix` and `ttl` are applied AFTER the spread, so those two
 * fields are always the peer's rather than the primary's.
 */
export function registerCachePeers(
  platform: NpmMetaPlatform,
  cache: TtlCache,
  prefix: string,
  options?: TtlCacheOptions | undefined,
): NpmMetaCachePeers {
  const peers: NpmMetaCachePeers = {
    stale: platform.createCache({
      ...options,
      prefix: `${prefix}-stale`,
      ttl: STALE_TTL_MS,
    }),
    storm: platform.createCache({
      ...options,
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
  platform: NpmMetaPlatform,
  cache: TtlCache,
  key: string,
  meta: PackumentMetaSlim,
): Promise<void> {
  await getCachePeers(platform, cache).stale.set(key, cloneMeta(meta))
}
