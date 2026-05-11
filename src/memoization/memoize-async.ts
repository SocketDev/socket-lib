/**
 * @fileoverview `memoizeAsync` — async-aware memoizer with the same
 * LRU+TTL contract as `memoize`, plus thundering-herd dedup. Concurrent
 * callers join an in-flight promise instead of starting fresh fetches,
 * and the cache timestamp is refreshed on resolution so a slow fn can't
 * land a value that's already "expired".
 */

import { debugLog } from '../debug'
import { DateNow } from '../primordials/date'
import { MapCtor } from '../primordials/map-set'
import { PromiseResolve } from '../primordials/promise'

import { cacheRegistry, defaultKeyGen } from './_internal'

import type { CacheEntry, MemoizeOptions } from './types'

/**
 * Memoize an async function.
 * Similar to memoize() but handles promises properly.
 *
 * @param fn - Async function to memoize
 * @param options - Memoization options
 * @returns Memoized version of the async function
 *
 * @example
 * import { memoizeAsync } from '@socketsecurity/lib/memoization/memoize-async'
 *
 * const fetchUser = memoizeAsync(async (id: string) => {
 *   const response = await fetch(`/api/users/${id}`)
 *   return response.json()
 * }, { ttl: 300000, name: 'fetchUser' })
 *
 * await fetchUser('123') // Fetches from API
 * await fetchUser('123') // Returns cached result
 */
export function memoizeAsync<Args extends unknown[], Result>(
  fn: (...args: Args) => Promise<Result>,
  options: MemoizeOptions<Args> = {},
): (...args: Args) => Promise<Result> {
  const {
    keyGen = (...args) => defaultKeyGen(args),
    maxSize = Number.POSITIVE_INFINITY,
    name = fn.name || 'anonymous',
    ttl = Number.POSITIVE_INFINITY,
  } = options

  // LRU via Map insertion-order: see `memoize()` above for the full
  // rationale. Key lifecycle on bump: `cache.delete(key)` +
  // `cache.set(key, entry)` moves the entry to the tail in O(1).
  const cache = new MapCtor<string, CacheEntry<Promise<Result>>>()

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
        debugLog(`[memoizeAsync:${name}] clear`, {
          key: oldest,
          reason: 'LRU',
        })
      }
    }
  }

  function isExpired(entry: CacheEntry<Promise<Result>>): boolean {
    // ttl===Infinity arm fires for callers who pass that explicitly;
    // most tests use a finite ttl.
    /* c8 ignore next 3 */
    if (ttl === Number.POSITIVE_INFINITY) {
      return false
    }
    return DateNow() - entry.timestamp > ttl
  }

  // Bump an existing cache entry to the tail (most-recently-used) in
  // O(1). Caller must have already verified `cache.has(key)`.
  function bumpRecency(key: string, entry: CacheEntry<Promise<Result>>): void {
    cache.delete(key)
    cache.set(key, entry)
  }

  // Track in-flight refreshes to prevent thundering herd on TTL expiry.
  const refreshing = new MapCtor<string, Promise<Result>>()

  return async function memoized(...args: Args): Promise<Result> {
    const key = keyGen(...args)

    const cached = cache.get(key)
    // Cache-hit, expired-with-inflight (stale-dedup), and cold-dedup
    // sub-arms all tested but not always paired in a single run.
    /* c8 ignore start */
    if (cached) {
      if (!isExpired(cached)) {
        cached.hits++
        bumpRecency(key, cached)
        debugLog(`[memoizeAsync:${name}] hit`, { key, hits: cached.hits })
        return await cached.value
      }
      const inflight = refreshing.get(key)
      if (inflight) {
        debugLog(`[memoizeAsync:${name}] stale-dedup`, { key })
        bumpRecency(key, cached)
        return await inflight
      }
      cache.delete(key)
    }

    const inflightCold = refreshing.get(key)
    if (inflightCold) {
      debugLog(`[memoizeAsync:${name}] cold-dedup`, { key })
      return await inflightCold
    }
    /* c8 ignore stop */

    debugLog(`[memoizeAsync:${name}] miss`, { key })

    // Create promise and cache it immediately (for deduplication).
    // The async IIFE is what gets stored in `refreshing` and `cache`,
    // so concurrent callers can join the same in-flight computation
    // before it resolves — that's the dedup contract.
    const promise = (async () => {
      try {
        const result = await fn(...args)
        refreshing.delete(key)
        // Success — refresh the timestamp so the freshly-computed
        // value isn't immediately classified as expired. The
        // timestamp was previously set when the fetch *started*;
        // under a slow fn this meant `isExpired` could fire right
        // as the value landed, and every subsequent call past TTL
        // recomputed because the stale-dedup branch had nothing to
        // join (`refreshing` was emptied here first).
        const entry = cache.get(key)
        if (entry) {
          entry.value = PromiseResolve(result)
          entry.timestamp = DateNow()
        }
        return result
      } catch (error) {
        refreshing.delete(key)
        // Failure — remove from cache to allow retry.
        cache.delete(key)
        debugLog(`[memoizeAsync:${name}] error`, { key, error })
        throw error
      }
    })()
    refreshing.set(key, promise)

    evictLRU()
    cache.set(key, {
      value: promise,
      timestamp: Date.now(),
      hits: 0,
    })

    debugLog(`[memoizeAsync:${name}] set`, { key, cacheSize: cache.size })
    return await promise
  }
}
