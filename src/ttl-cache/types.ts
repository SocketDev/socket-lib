/**
 * @file Public type surface for `ttl-cache/*` modules — the `TtlCache`
 *   interface (the seven-method API returned by `createTtlCache`), the
 *   `TtlCacheEntry` storage shape, and the `TtlCacheOptions` / `ClearOptions`
 *   configuration records. Pure types, no runtime side effects.
 */

export interface ClearOptions {
  /**
   * Only clear in-memory memoization cache, not persistent cache. Useful for
   * forcing a refresh of cached data without removing it from disk.
   *
   * @default false
   */
  memoOnly?: boolean | undefined
}

export interface TtlCache {
  /**
   * Get cached data without fetching. Returns undefined if not found or
   * expired.
   *
   * @param key - Cache key (must not contain wildcards)
   *
   * @throws {TypeError} If key contains wildcards (*)
   */
  get<T>(key: string): Promise<T | undefined>
  /**
   * Get all cached entries matching a pattern. Supports wildcards (*) for
   * flexible matching.
   *
   * @param pattern - Key pattern (supports * wildcards, or use '*' for all
   *   entries)
   *
   * @returns Map of matching entries (key -> value)
   */
  getAll<T>(pattern: string): Promise<Map<string, T>>
  /**
   * Get cached data or fetch and cache if missing/expired.
   *
   * @param key - Cache key (must not contain wildcards)
   */
  getOrFetch<T>(key: string, fetcher: () => Promise<T>): Promise<T>
  /**
   * Set cached data with TTL.
   *
   * @param key - Cache key (must not contain wildcards)
   *
   * @throws {TypeError} If key contains wildcards (*)
   */
  set<T>(key: string, data: T): Promise<void>
  /**
   * Delete a specific cache entry.
   *
   * @param key - Cache key (must not contain wildcards)
   *
   * @throws {TypeError} If key contains wildcards (*)
   */
  delete(key: string): Promise<void>
  /**
   * Delete all cache entries matching a pattern. Supports wildcards (*) for
   * flexible matching.
   *
   * @param pattern - Key pattern (supports * wildcards, or omit to delete all)
   *
   * @returns Number of entries deleted
   */
  deleteAll(pattern?: string | undefined): Promise<number>
  /**
   * Clear all cache entries (like Map.clear()). Optionally clear only in-memory
   * cache.
   *
   * @param options - Optional configuration.
   */
  clear(options?: ClearOptions | undefined): Promise<void>
}

export interface TtlCacheEntry<T> {
  data: T
  expiresAt: number
}

export interface TtlCacheOptions {
  /**
   * Time-to-live in milliseconds.
   *
   * @default 5 * 60 * 1000 (5 minutes)
   */
  ttl?: number | undefined
  /**
   * Enable in-memory memoization for hot data.
   *
   * @default true
   */
  memoize?: boolean | undefined
  /**
   * Maximum number of entries to keep in the in-memory memo cache. When
   * exceeded, the least-recently-used entry is evicted. The persistent
   * (cacache) layer is unaffected.
   *
   * @default 1000
   */
  memoMaxSize?: number | undefined
  /**
   * Custom cache key prefix. Must not contain wildcards (_). Use clear({
   * prefix: "pattern_" }) for wildcard matching instead.
   *
   * @default 'ttl-cache'
   *
   * @throws {TypeError} If prefix contains wildcards
   */
  prefix?: string | undefined
}
