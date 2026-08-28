/**
 * @file `memoizeWeakAsync` — async memoizer keyed by an object reference via
 *   `WeakMap`. The async counterpart of `memoizeWeak`, and the object-keyed
 *   counterpart of `memoizeAsync`.
 *   WHY IT IS NOT `memoizeWeak` WRAPPING AN ASYNC FUNCTION. A rejected promise
 *   is a perfectly good return value, so `memoizeWeak` would store it and hand
 *   the same failure to every later caller with no way to retry. This evicts
 *   on rejection instead, so the next call recomputes.
 *   WHY IT IS NOT `memoizeAsync`. That one is keyed by a generated string, so
 *   it needs `maxSize` and LRU eviction to stay bounded. Here the key is the
 *   object itself: the entry is collectable as soon as the caller drops the
 *   key, so there is no size to cap and no eviction policy to tune.
 *   Caching the in-flight promise is also what deduplicates concurrent callers
 *   — two calls with the same key before the first settles share one
 *   computation, which is why the promise is stored before it resolves rather
 *   than after.
 */

import { debugLog } from '../debug/output.mjs'
import { WeakMapCtor } from '../primordials/map-set.mjs'

/**
 * Memoize an async function keyed by an object reference.
 *
 * @example
 *   import { memoizeWeakAsync } from '@socketsecurity/lib/memo/weak-async'
 *
 *   const loadManifest = memoizeWeakAsync(async (pkg: Package) => {
 *     return await readManifest(pkg)
 *   })
 *
 *   await loadManifest(pkg) // Computed
 *   await loadManifest(pkg) // Cached
 *   // Concurrent calls share one read; a rejected read is not cached.
 *
 * @param fn - Async function to memoize. Takes a single object key.
 *
 * @returns Memoized version backed by a WeakMap.
 */
export function memoizeWeakAsync<K extends object, Result>(
  fn: (key: K) => Promise<Result> | Result,
): (key: K) => Promise<Result> {
  const cache = new WeakMapCtor<K, Promise<Result>>()

  return async function memoized(key: K): Promise<Result> {
    // The stored value is always a promise, so a truthy check is enough — the
    // `has` fallback `memoizeWeak` needs for a cached `undefined` does not
    // apply here.
    const cached = cache.get(key)
    if (cached) {
      debugLog(`[memoizeWeakAsync:${fn.name}] hit`)
      return await cached
    }

    debugLog(`[memoizeWeakAsync:${fn.name}] miss`)
    const promise = (async () => await fn(key))()
    cache.set(key, promise)

    // Attached AFTER the set so the eviction cannot race ahead of it, and
    // guarded on identity so a retry already in the cache is left alone.
    // Returning nothing here keeps this a cleanup handler, not a recovery one:
    // the rejection still reaches the caller through the await below.
    promise.catch(() => {
      if (cache.get(key) === promise) {
        cache.delete(key)
        debugLog(`[memoizeWeakAsync:${fn.name}] evicted after rejection`)
      }
    })

    return await promise
  }
}
