/**
 * @fileoverview Memoization utilities for caching function results.
 * Provides function result caching to optimize repeated computations and expensive operations.
 */

import { debugLog } from './debug'

/**
 * Global registry of memoization cache clear functions.
 */
const cacheRegistry: Array<() => void> = []

/**
 * Options for memoization behavior.
 */
export type MemoizeOptions<Args extends unknown[]> = {
  /** Custom cache key generator (defaults to JSON.stringify) */
  keyGen?: (...args: Args) => string
  /** Maximum cache size (LRU eviction when exceeded) */
  maxSize?: number
  /** TTL in milliseconds (cache entries expire after this time) */
  ttl?: number
  /** Cache name for debugging */
  name?: string
  /** Weak cache for object keys (enables GC) */
  weak?: boolean
  /** Custom equality check for cache hits */
  equals?: (a: Args, b: Args) => boolean
}

/**
 * Cache entry with metadata.
 */
type CacheEntry<T> = {
  value: T
  timestamp: number
  hits: number
}

/**
 * Default cache key generator that disambiguates `undefined`, `BigInt`, and
 * `Map`/`Set` arguments (which `JSON.stringify` drops or collapses).
 * @private
 */
function defaultKeyGen(args: readonly unknown[]): string {
  return JSON.stringify(args, (_key, value) => {
    if (value === undefined) {
      return '\0undefined'
    }
    if (typeof value === 'bigint') {
      return `\0bigint:${value.toString()}`
    }
    if (typeof value === 'function') {
      return `\0fn:${value.name || 'anonymous'}`
    }
    if (value instanceof Map) {
      return { __tag: 'Map', entries: Array.from(value.entries()) }
    }
    if (value instanceof Set) {
      return { __tag: 'Set', values: Array.from(value.values()) }
    }
    return value
  })
}

/**
 * Clear all memoization caches.
 * Useful for testing or when you need to force recomputation.
 *
 * @example
 * ```typescript
 * clearAllMemoizationCaches()
 * ```
 */
export function clearAllMemoizationCaches(): void {
  debugLog('[memoize:all] clear', { action: 'clear-all-caches' })
  for (const clear of cacheRegistry) {
    clear()
  }
}

/**
 * Create a memoized version of a method.
 * Preserves 'this' context for class methods.
 *
 * @param target - Object containing the method
 * @param propertyKey - Method name
 * @param descriptor - Property descriptor
 * @returns Modified descriptor with memoized method
 *
 * @example
 * import { Memoize } from '@socketsecurity/lib/memoization'
 *
 * class Calculator {
 *   @Memoize()
 *   fibonacci(n: number): number {
 *     if (n <= 1) return n
 *     return this.fibonacci(n - 1) + this.fibonacci(n - 2)
 *   }
 * }
 */
export function Memoize(options: MemoizeOptions<unknown[]> = {}) {
  return (
    _target: unknown,
    propertyKey: string,
    descriptor: PropertyDescriptor,
  ): PropertyDescriptor => {
    const originalMethod = descriptor.value as (...args: unknown[]) => unknown

    descriptor.value = memoize(originalMethod, {
      ...options,
      name: options.name || propertyKey,
    })

    return descriptor
  }
}

/**
 * Memoize a function with configurable caching behavior.
 * Caches function results to avoid repeated computation.
 *
 * @param fn - Function to memoize
 * @param options - Memoization options
 * @returns Memoized version of the function
 *
 * @example
 * import { memoize } from '@socketsecurity/lib/memoization'
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
    throw new TypeError('TTL must be non-negative')
  }

  // LRU via Map insertion-order: delete+re-insert moves a key to the
  // end in O(1). The oldest key is `cache.keys().next().value`. This
  // replaces the prior parallel `accessOrder: string[]` which cost
  // O(n) per hit (indexOf + splice) and scaled poorly for large caches.
  const cache = new Map<string, CacheEntry<Result>>()

  // Register for global clearing.
  cacheRegistry.push(() => {
    cache.clear()
  })

  function evictLRU(): void {
    if (cache.size >= maxSize) {
      const oldest = cache.keys().next().value
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
    return Date.now() - entry.timestamp > ttl
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

/**
 * Memoize an async function.
 * Similar to memoize() but handles promises properly.
 *
 * @param fn - Async function to memoize
 * @param options - Memoization options
 * @returns Memoized version of the async function
 *
 * @example
 * import { memoizeAsync } from '@socketsecurity/lib/memoization'
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
  const cache = new Map<string, CacheEntry<Promise<Result>>>()

  // Register for global clearing.
  cacheRegistry.push(() => {
    cache.clear()
  })

  function evictLRU(): void {
    if (cache.size >= maxSize) {
      const oldest = cache.keys().next().value
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
    if (ttl === Number.POSITIVE_INFINITY) {
      return false
    }
    return Date.now() - entry.timestamp > ttl
  }

  // Bump an existing cache entry to the tail (most-recently-used) in
  // O(1). Caller must have already verified `cache.has(key)`.
  function bumpRecency(key: string, entry: CacheEntry<Promise<Result>>): void {
    cache.delete(key)
    cache.set(key, entry)
  }

  // Track in-flight refreshes to prevent thundering herd on TTL expiry.
  const refreshing = new Map<string, Promise<Result>>()

  return async function memoized(...args: Args): Promise<Result> {
    const key = keyGen(...args)

    const cached = cache.get(key)
    if (cached) {
      if (!isExpired(cached)) {
        cached.hits++
        bumpRecency(key, cached)
        debugLog(`[memoizeAsync:${name}] hit`, { key, hits: cached.hits })
        return await cached.value
      }
      // Expired but another caller is already refreshing — await the
      // in-flight refresh so stale callers see the fresh value.
      const inflight = refreshing.get(key)
      if (inflight) {
        debugLog(`[memoizeAsync:${name}] stale-dedup`, { key })
        // Bump recency so the entry we're refreshing isn't evicted
        // under LRU pressure while a peer is computing on our behalf.
        bumpRecency(key, cached)
        return await inflight
      }
      // Expired and no in-flight refresh — drop it before recomputing.
      cache.delete(key)
    }

    debugLog(`[memoizeAsync:${name}] miss`, { key })

    // Create promise and cache it immediately (for deduplication).
    const promise = fn(...args).then(
      result => {
        refreshing.delete(key)
        // Success — refresh the timestamp so the freshly-computed value
        // isn't immediately classified as expired. The timestamp was
        // previously set when the fetch *started*; under a slow fn this
        // meant `isExpired` could fire right as the value landed, and
        // every subsequent call past TTL recomputed because the
        // stale-dedup branch had nothing to join (`refreshing` was
        // emptied here first).
        const entry = cache.get(key)
        if (entry) {
          entry.value = Promise.resolve(result)
          entry.timestamp = Date.now()
        }
        return result
      },
      error => {
        refreshing.delete(key)
        // Failure — remove from cache to allow retry.
        cache.delete(key)
        debugLog(`[memoizeAsync:${name}] error`, { key, error })
        throw error
      },
    )
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

/**
 * Memoize with WeakMap for object keys.
 * Allows garbage collection when objects are no longer referenced.
 * Only works when first argument is an object.
 *
 * @param fn - Function to memoize
 * @returns Memoized version using WeakMap
 *
 * @example
 * import { memoizeWeak } from '@socketsecurity/lib/memoization'
 *
 * const processConfig = memoizeWeak((config: Config) => {
 *   return expensiveTransform(config)
 * })
 *
 * processConfig(config1) // Computed
 * processConfig(config1) // Cached
 * // When config1 is no longer referenced, cache entry is GC'd
 */
export function memoizeWeak<K extends object, Result>(
  fn: (key: K) => Result,
): (key: K) => Result {
  const cache = new WeakMap<K, Result>()

  return function memoized(key: K): Result {
    if (cache.has(key)) {
      debugLog(`[memoizeWeak:${fn.name}] hit`)
      return cache.get(key) as Result
    }

    debugLog(`[memoizeWeak:${fn.name}] miss`)
    const result = fn(key)
    cache.set(key, result)
    return result
  }
}

/**
 * Simple once() for zero-argument initialization functions.
 * Caches a single result forever and emits debug-log events on hit/miss.
 *
 * @param fn - Zero-argument function to run once
 * @returns Memoized version that only executes once
 *
 * @example
 * import { once } from '@socketsecurity/lib/memoization'
 *
 * const initialize = once(() => {
 *   console.log('Initializing…')
 *   return loadConfig()
 * })
 *
 * initialize() // Logs "Initializing…" and returns config
 * initialize() // Returns cached config (no log)
 */
export function once<Result>(fn: () => Result): () => Result {
  let called = false
  let result: Result

  return function memoized(): Result {
    if (!called) {
      result = fn()
      called = true
      debugLog(`[once:${fn.name}] set`)
    } else {
      debugLog(`[once:${fn.name}] hit`)
    }
    return result
  }
}
