/**
 * @file Node twin of the cached packument fetch — binds the platform-free
 *   policy core (`./shared`) to the two capabilities it refuses to import for
 *   itself: `httpJson` from `../../http-request/node` and the cacache-backed
 *   `createTtlCache`. Mirrors `./browser` export for export, so the
 *   `./npm/meta-cache` subpath can carry a `browser` condition and swap the
 *   two without a consumer changing an import.
 *   This is the default resolution. A browser bundler that honors the
 *   `browser` condition gets `./browser` instead; a browser bundler that does
 *   NOT is why every `node:` builtin reachable from here stays behind the
 *   package's top-level `browser` field.
 */

import { createTtlCache } from '../../cache/ttl/store.mjs'
// no-platform-http-import: this file IS the Node half of a platform twin pair; binding the Node HTTP implementation is its entire job.
import { httpJson } from '../../http-request/node.mjs'
import {
  createNpmMetaCache as createSharedNpmMetaCache,
  getCachePeers as getSharedCachePeers,
  getStaleMeta as getSharedStaleMeta,
  registerCachePeers as registerSharedCachePeers,
  rememberStaleMeta as rememberSharedStaleMeta,
} from './shared.mjs'
import { resolvePackumentSlim } from './shared-policy.mjs'

import type { NpmMetaCachePeers, NpmMetaPlatform } from './shared.mjs'
import type {
  GetPackumentSlimOptions,
  PackumentMetaSlim,
} from '../meta-types.mjs'
import type { TtlCache, TtlCacheOptions } from '../../cache/ttl/types.mjs'

export {
  buildMetaCacheKey,
  cloneMeta,
  normalizeRegistryUrl,
  PackumentNotFoundError,
} from './shared.mjs'
export {
  fetchAndCacheEntry,
  fetchPackumentSlim,
  serveStaleOnFailure,
} from './shared-policy.mjs'
export type {
  CachedPackumentEntry,
  CachedPackumentHit,
  CachedPackumentMiss,
  NpmMetaCachePeers,
  NpmMetaPlatform,
  ResolvedPackumentFetchOptions,
} from './shared.mjs'

let defaultMetaCache: TtlCache | undefined

/**
 * The Node platform bindings: a cacache-backed persistent cache and the Node
 * HTTP stack.
 */
export const NODE_META_PLATFORM: NpmMetaPlatform = {
  createCache: createTtlCache,
  getDefaultCache: getDefaultMetaCache,
  http: { json: httpJson },
}

/**
 * Create a dedicated npm-meta cache instance — same `prefix` / default-`ttl`
 * as the module singleton, overridable per-call. Use this (vs. the default
 * singleton) for test isolation or a non-default TTL.
 */
export function createNpmMetaCache(
  options?: TtlCacheOptions | undefined,
): TtlCache {
  return createSharedNpmMetaCache(NODE_META_PLATFORM, options)
}

/**
 * Resolve the persisted-stale + storm-control companions for a primary cache
 * instance, creating them lazily for a `TtlCache` that wasn't created via
 * `createNpmMetaCache`.
 */
export function getCachePeers(cache: TtlCache): NpmMetaCachePeers {
  return getSharedCachePeers(NODE_META_PLATFORM, cache)
}

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
 * Fetch a package's packument, slice it down to `PackumentMetaSlim`, and cache
 * the result on disk. See `./shared`'s file doc for the `force` /
 * negative-cache / serve-stale-on-error policies.
 *
 * @throws {PackumentNotFoundError} When the registry returns a definitive 404
 *   and no previously-good data exists for this key to serve instead.
 */
export async function getPackumentSlim(
  name: string,
  options?: GetPackumentSlimOptions | undefined,
): Promise<PackumentMetaSlim> {
  return await resolvePackumentSlim(NODE_META_PLATFORM, name, options)
}

/**
 * Look up the persisted last known-good value for `key`, if any.
 */
export async function getStaleMeta(
  cache: TtlCache,
  key: string,
): Promise<PackumentMetaSlim | undefined> {
  return await getSharedStaleMeta(NODE_META_PLATFORM, cache, key)
}

/**
 * Create and register the persisted-stale + storm-control companion caches
 * for `cache` under `prefix`.
 */
export function registerCachePeers(
  cache: TtlCache,
  prefix: string,
  options?: TtlCacheOptions | undefined,
): NpmMetaCachePeers {
  return registerSharedCachePeers(NODE_META_PLATFORM, cache, prefix, options)
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
  await rememberSharedStaleMeta(NODE_META_PLATFORM, cache, key, meta)
}
