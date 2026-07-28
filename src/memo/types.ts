/**
 * @file Public type surface for `memo/*` modules — `MemoizeOptions` is the
 *   user-facing options bag accepted by every memoize entrypoint,
 *   `CacheEntry<T>` is the internal row stored in each per-function cache. Pure
 *   types, no runtime side effects.
 */

/**
 * Options for memoization behavior.
 */
export type MemoizeOptions<Args extends unknown[]> = {
  /**
   * Custom cache key generator (defaults to JSON.stringify)
   */
  keyGen?: ((...args: Args) => string) | undefined
  /**
   * Maximum cache size (LRU eviction when exceeded)
   */
  maxSize?: number | undefined
  /**
   * TTL in milliseconds (cache entries expire after this time)
   */
  ttl?: number | undefined
  /**
   * Cache name for debugging.
   */
  name?: string | undefined
  /**
   * Weak cache for object keys (enables GC)
   */
  weak?: boolean | undefined
  /**
   * Custom equality check for cache hits.
   */
  equals?: ((a: Args, b: Args) => boolean) | undefined
}

/**
 * Cache entry with metadata.
 */
export type CacheEntry<T> = {
  value: T
  timestamp: number
  hits: number
}
