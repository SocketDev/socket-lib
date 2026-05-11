/**
 * @fileoverview `memoize` — synchronous function memoizer with LRU
 * eviction (Map insertion-order based), optional TTL, and optional
 * custom key generator. Each instance registers itself with the
 * shared `cacheRegistry` so `clearAllMemoizationCaches` can sweep it.
 */

import { debugLog } from '../debug/output'
import { DateNow } from '../primordials/date'
import { TypeErrorCtor } from '../primordials/error'
import { MapCtor } from '../primordials/map-set'

import { cacheRegistry, defaultKeyGen } from './_internal'

import type { CacheEntry, MemoizeOptions } from './types'

/**
 * Memoize a function with configurable caching behavior.
 * Caches function results to avoid repeated computation.
 *
 * @param fn - Function to memoize
 * @param options - Memoization options
 * @returns Memoized version of the function
 *
 * @example
 * import { memoize } from '@socketsecurity/lib/memo/memoize'
 *
 * const expensiveOperation = memoize((n: number) => {
 *   // Heavy computation
 *   return Array(n).fill(0).reduce((a, _, i) => a + i, 0)
 * }, { maxSize: 100, ttl: 60000, name: 'sum' })
 *
 * expensiveOperation(1000) // Computed
 * expensiveOperation(1000) // Cached
 */
export function memoize<Args extends unknown[], Result>(
  fn: (...args: Args) => Result,
  options: MemoizeOptions<Args> = {},
): (...args: Args) => Result {
  const {
    keyGen = (...args) => defaultKeyGen(args),
    maxSize = Number.POSITIVE_INFINITY,
    name = fn.name || 'anonymous',
    ttl = Number.POSITIVE_INFINITY,
  } = options

  if (ttl < 0) {
    throw new TypeErrorCtor('TTL must be non-negative')
  }

  // LRU via Map insertion-order: delete+re-insert moves a key to the
  // end in O(1). The oldest key is `cache.keys().next().value`. This
  // replaces the prior parallel `accessOrder: string[]` which cost
  // O(n) per hit (indexOf + splice) and scaled poorly for large caches.
  const cache = new MapCtor<string, CacheEntry<Result>>()

  // Register for global clearing.
  cacheRegistry.push(() => {
    cache.clear()
  })

  function evictLRU(): void {
    if (cache.size >= maxSize) {
      const oldest = cache.keys().next().value
      /* c8 ignore next 8 - cache.size >= maxSize guarantees keys().next()
         yields a defined value; the undefined branch is defensive. */
      if (oldest !== undefined) {
        cache.delete(oldest)
        debugLog(`[memoize:${name}] clear`, {
          key: oldest,
          reason: 'LRU',
        })
      }
    }
  }

  function isExpired(entry: CacheEntry<Result>): boolean {
    if (ttl === Number.POSITIVE_INFINITY) {
      return false
    }
    return DateNow() - entry.timestamp > ttl
  }

  return function memoized(...args: Args): Result {
    const key = keyGen(...args)

    const cached = cache.get(key)
    if (cached) {
      if (!isExpired(cached)) {
        cached.hits++
        // Bump recency: delete + re-insert moves the entry to Map's
        // insertion-order tail in O(1).
        cache.delete(key)
        cache.set(key, cached)

        debugLog(`[memoize:${name}] hit`, { key, hits: cached.hits })
        return cached.value
      }
      // Expired — drop it before recomputing.
      cache.delete(key)
    }

    debugLog(`[memoize:${name}] miss`, { key })
    const value = fn(...args)

    evictLRU()
    cache.set(key, {
      value,
      timestamp: Date.now(),
      hits: 0,
    })

    debugLog(`[memoize:${name}] set`, { key, cacheSize: cache.size })
    return value
  }
}
