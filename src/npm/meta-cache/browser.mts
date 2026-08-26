/**
 * @file Browser twin of the cached packument fetch — same policy core
 *   (`./shared`), same exports as `./node`, bound instead to `httpJson` from
 *   `../../http-request/browser` (a `fetch` wrapper) and to
 *   `createBrowserTtlCache` (`../../cache/ttl/browser`). Nothing reachable
 *   from here imports a `node:` builtin, which
 *   `scripts/repo/check/browser-exports-have-no-node-builtins.mts` enforces on
 *   every build rather than trusting this comment.
 *
 *   ## Why the default cache is memory-only
 *
 *   The persistent tier defaults to NOTHING, making the default cache a
 *   per-page in-memory LRU. That is a deliberate choice, not a stub:
 *
 *   1. **No web storage API exists in every context this twin targets.** An MV3
 *      service worker has no `localStorage` and no `window` at all; a sandboxed
 *      iframe throws `SecurityError` on first access. A default that reaches
 *      for one is a default that throws somewhere real.
 *   2. **`localStorage` is the wrong shape for this payload.** It is synchronous
 *      main-thread I/O with a ~5 MB origin budget, and a slimmed packument for
 *      a popular package runs to hundreds of KB. Caching packuments there
 *      evicts the host application's own data to store something that is, by
 *      definition, re-fetchable.
 *   3. **A cache is never load-bearing.** Every read falls back to a fetch, so
 *      losing the tier across a page load costs latency, never correctness. So
 *      durability is opt-IN and explicit rather than guessed. Pass any
 *      `TtlCacheStorage` to `createNpmMetaCache({ storage })` —
 *      `chrome.storage.local`, IndexedDB, a `Cache` API wrapper, or your own —
 *      or use `createWebStorageMetaCache(localStorage)` for the one-line Web
 *      Storage path. The shape stays honest either way: with no storage the
 *      cache is documented memo-only, and `createBrowserTtlCache` swallows
 *      adapter failures so a full quota degrades to memo-only rather than
 *      throwing.
 */

import { createBrowserTtlCache } from '../../cache/ttl/browser.mjs'
// no-platform-http-import: this file IS the browser half of a platform twin pair; binding the browser HTTP implementation is its entire job.
import { httpJson } from '../../http-request/browser.mjs'
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
import type {
  BrowserTtlCacheOptions,
  TtlCache,
  TtlCacheStorage,
} from '../../cache/ttl/types.mjs'

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

/**
 * The synchronous key-value surface `window.localStorage` and
 * `window.sessionStorage` both implement. Declared structurally so this module
 * needs no DOM lib reference and accepts any work-alike.
 */
export interface WebStorageLike {
  getItem(key: string): string | null
  key(index: number): string | null
  length: number
  removeItem(key: string): void
  setItem(key: string, value: string): void
}

let defaultMetaCache: TtlCache | undefined

/**
 * The browser platform bindings: a storage-adapter-backed cache and `fetch`.
 */
export const BROWSER_META_PLATFORM: NpmMetaPlatform = {
  createCache: createBrowserTtlCache,
  getDefaultCache: getDefaultMetaCache,
  http: { json: httpJson },
}

/**
 * Create a dedicated npm-meta cache instance. Pass `storage` to give it a
 * persistent tier; omit it for a memo-only cache. See the file doc for why
 * memo-only is the default.
 */
export function createNpmMetaCache(
  options?: BrowserTtlCacheOptions | undefined,
): TtlCache {
  return createSharedNpmMetaCache(BROWSER_META_PLATFORM, options)
}

/**
 * Adapt a Web Storage object (`localStorage` / `sessionStorage`) to the
 * `TtlCacheStorage` contract. `keys()` is implemented via the indexed
 * `key(i)` accessor, so wildcard operations cover entries written by earlier
 * page loads rather than only the current session's memo tier.
 */
export function createWebStorageAdapter(
  storage: WebStorageLike,
): TtlCacheStorage {
  return {
    getItem(key: string): string | null {
      return storage.getItem(key)
    },
    keys(): string[] {
      const found: string[] = []
      for (let i = 0, { length } = storage; i < length; i += 1) {
        const key = storage.key(i)
        if (key !== null) {
          found.push(key)
        }
      }
      return found
    },
    removeItem(key: string): void {
      storage.removeItem(key)
    },
    setItem(key: string, value: string): void {
      storage.setItem(key, value)
    },
  }
}

/**
 * Create an npm-meta cache whose persistent tier is a Web Storage object —
 * the one-line durable path for a page or content script that has one.
 *
 * @example
 *   ;```typescript
 *   const cache = createWebStorageMetaCache(localStorage)
 *   const meta = await getPackumentSlim('left-pad', { cache })
 *   ```
 */
export function createWebStorageMetaCache(
  storage: WebStorageLike,
  options?: BrowserTtlCacheOptions | undefined,
): TtlCache {
  return createNpmMetaCache({
    ...options,
    storage: createWebStorageAdapter(storage),
  })
}

/**
 * Resolve the persisted-stale + storm-control companions for a primary cache
 * instance, creating them lazily for a `TtlCache` that wasn't created via
 * `createNpmMetaCache`.
 */
export function getCachePeers(cache: TtlCache): NpmMetaCachePeers {
  return getSharedCachePeers(BROWSER_META_PLATFORM, cache)
}

/**
 * The module-level default cache instance, created lazily on first use.
 * Memo-only — see the file doc.
 */
export function getDefaultMetaCache(): TtlCache {
  if (defaultMetaCache === undefined) {
    defaultMetaCache = createNpmMetaCache()
  }
  return defaultMetaCache
}

/**
 * Fetch a package's packument and slice it down to `PackumentMetaSlim`. See
 * `./shared`'s file doc for the `force` / negative-cache /
 * serve-stale-on-error policies.
 *
 * @throws {PackumentNotFoundError} When the registry returns a definitive 404
 *   and no previously-good data exists for this key to serve instead.
 */
export async function getPackumentSlim(
  name: string,
  options?: GetPackumentSlimOptions | undefined,
): Promise<PackumentMetaSlim> {
  return await resolvePackumentSlim(BROWSER_META_PLATFORM, name, options)
}

/**
 * Look up the persisted last known-good value for `key`, if any.
 */
export async function getStaleMeta(
  cache: TtlCache,
  key: string,
): Promise<PackumentMetaSlim | undefined> {
  return await getSharedStaleMeta(BROWSER_META_PLATFORM, cache, key)
}

/**
 * Create and register the persisted-stale + storm-control companion caches
 * for `cache` under `prefix`.
 */
export function registerCachePeers(
  cache: TtlCache,
  prefix: string,
  options?: BrowserTtlCacheOptions | undefined,
): NpmMetaCachePeers {
  return registerSharedCachePeers(BROWSER_META_PLATFORM, cache, prefix, options)
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
  await rememberSharedStaleMeta(BROWSER_META_PLATFORM, cache, key, meta)
}
