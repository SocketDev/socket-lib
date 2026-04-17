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
type MemoizeOptions<Args extends unknown[], _Result = unknown> = {
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
export function Memoize(options: MemoizeOptions<unknown[], unknown> = {}) {
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
  options: MemoizeOptions<Args, Result> = {},
): (...args: Args) => Result {
  const {
    keyGen = (...args) => JSON.stringify(args),
    maxSize = Number.POSITIVE_INFINITY,
    name = fn.name || 'anonymous',
    ttl = Number.POSITIVE_INFINITY,
  } = options

  if (ttl < 0) {
    throw new TypeError('TTL must be non-negative')
  }

  const cache = new Map<string, CacheEntry<Result>>()
  const accessOrder: string[] = []

  // Register for global clearing.
  cacheRegistry.push(() => {
    cache.clear()
    accessOrder.length = 0
  })

  function evictLRU(): void {
    if (cache.size >= maxSize && accessOrder.length > 0) {
      const oldest = accessOrder.shift()
      if (oldest) {
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

    // Check cache
    const cached = cache.get(key)
    if (cached) {
      if (!isExpired(cached)) {
        cached.hits++
        // Move to end of access order (LRU)
        const index = accessOrder.indexOf(key)
        if (index !== -1) {
          accessOrder.splice(index, 1)
        }
        accessOrder.push(key)

        debugLog(`[memoize:${name}] hit`, { key, hits: cached.hits })
        return cached.value
      }
      // Clean up expired entry before re-caching.
      cache.delete(key)
      const index = accessOrder.indexOf(key)
      if (index !== -1) {
        accessOrder.splice(index, 1)
      }
    }

    // Cache miss - compute value
    debugLog(`[memoize:${name}] miss`, { key })
    const value = fn(...args)

    // Store in cache
    evictLRU()
    cache.set(key, {
      value,
      timestamp: Date.now(),
      hits: 0,
    })
    accessOrder.push(key)

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
  options: MemoizeOptions<Args, Result> = {},
): (...args: Args) => Promise<Result> {
  const {
    keyGen = (...args) => JSON.stringify(args),
    maxSize = Number.POSITIVE_INFINITY,
    name = fn.name || 'anonymous',
    ttl = Number.POSITIVE_INFINITY,
  } = options

  const cache = new Map<string, CacheEntry<Promise<Result>>>()
  const accessOrder: string[] = []

  // Register for global clearing.
  cacheRegistry.push(() => {
    cache.clear()
    accessOrder.length = 0
  })

  function evictLRU(): void {
    if (cache.size >= maxSize && accessOrder.length > 0) {
      const oldest = accessOrder.shift()
      if (oldest) {
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

  // Track in-flight refreshes to prevent thundering herd on TTL expiry.
  const refreshing = new Set<string>()

  return async function memoized(...args: Args): Promise<Result> {
    const key = keyGen(...args)

    // Check cache
    const cached = cache.get(key)
    if (cached) {
      if (!isExpired(cached)) {
        cached.hits++
        // Move to end of access order (LRU)
        const index = accessOrder.indexOf(key)
        if (index !== -1) {
          accessOrder.splice(index, 1)
        }
        accessOrder.push(key)

        debugLog(`[memoizeAsync:${name}] hit`, { key, hits: cached.hits })
        return await cached.value
      }
      // Expired but another caller is already refreshing — return stale.
      if (refreshing.has(key)) {
        debugLog(`[memoizeAsync:${name}] stale-dedup`, { key })
        return await cached.value
      }
      // Clean up expired entry before re-caching.
      cache.delete(key)
      const index = accessOrder.indexOf(key)
      if (index !== -1) {
        accessOrder.splice(index, 1)
      }
    }

    // Cache miss - compute value
    debugLog(`[memoizeAsync:${name}] miss`, { key })
    refreshing.add(key)

    // Create promise and cache it immediately (for deduplication)
    const promise = fn(...args).then(
      result => {
        refreshing.delete(key)
        // Success - update cache entry with resolved promise
        const entry = cache.get(key)
        if (entry) {
          entry.value = Promise.resolve(result)
        }
        return result
      },
      error => {
        refreshing.delete(key)
        // Failure - remove from cache to allow retry
        cache.delete(key)
        const index = accessOrder.indexOf(key)
        if (index !== -1) {
          accessOrder.splice(index, 1)
        }
        debugLog(`[memoizeAsync:${name}] error`, { key, error })
        throw error
      },
    )

    // Store promise in cache
    evictLRU()
    cache.set(key, {
      value: promise,
      timestamp: Date.now(),
      hits: 0,
    })
    accessOrder.push(key)

    debugLog(`[memoizeAsync:${name}] set`, { key, cacheSize: cache.size })
    return await promise
  }
}

/**
 * Create a debounced memoized function.
 * Combines memoization with debouncing for expensive operations.
 *
 * @param fn - Function to memoize and debounce
 * @param wait - Debounce wait time in milliseconds
 * @param options - Memoization options
 * @returns Debounced memoized function
 *
 * @example
 * import { memoizeDebounced } from '@socketsecurity/lib/memoization'
 *
 * const search = memoizeDebounced(
 *   (query: string) => performSearch(query),
 *   300,
 *   { name: 'search' }
 * )
 */
export function memoizeDebounced<Args extends unknown[], Result>(
  fn: (...args: Args) => Result,
  wait: number,
  options: MemoizeOptions<Args, Result> = {},
): (...args: Args) => Result {
  const memoized = memoize(fn, options)
  let timeoutId: NodeJS.Timeout | undefined

  return function debounced(...args: Args): Result {
    if (timeoutId) {
      clearTimeout(timeoutId)
    }

    timeoutId = setTimeout(() => {
      memoized(...args)
    }, wait)

    // For immediate return, try cached value or compute synchronously
    return memoized(...args)
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
 * Simple once() implementation - caches single result forever.
 * Useful for initialization functions that should only run once.
 *
 * @param fn - Function to run once
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
