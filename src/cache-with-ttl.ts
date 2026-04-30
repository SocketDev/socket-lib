/**
 * @fileoverview Generic TTL-based caching utility using cacache.
 *
 * Provides a simple interface for caching data with time-to-live (TTL) expiration.
 * Uses cacache for persistent storage with metadata for TTL tracking.
 *
 * Features:
 * - Automatic expiration based on TTL
 * - In-memory memoization for hot data
 * - Persistent storage across process restarts
 * - Type-safe with generics
 *
 * Usage:
 * ```ts
 * const cache = createTtlCache({ ttl: 5 * 60 * 1000 }) // 5 minutes
 * const data = await cache.getOrFetch('key', async () => fetchData())
 * ```
 */

import * as cacache from './cacache'

import {
  DateNow,
  JSONParse,
  MapCtor,
  MathMax,
  RegExpCtor,
  StringPrototypeReplaceAll,
  StringPrototypeStartsWith,
  TypeErrorCtor,
} from './primordials'

export interface ClearOptions {
  /**
   * Only clear in-memory memoization cache, not persistent cache.
   * Useful for forcing a refresh of cached data without removing it from disk.
   *
   * @default false
   */
  memoOnly?: boolean | undefined
}

export interface TtlCache {
  /**
   * Get cached data without fetching.
   * Returns undefined if not found or expired.
   *
   * @param key - Cache key (must not contain wildcards)
   * @throws {TypeError} If key contains wildcards (*)
   */
  get<T>(key: string): Promise<T | undefined>
  /**
   * Get all cached entries matching a pattern.
   * Supports wildcards (*) for flexible matching.
   *
   * @param pattern - Key pattern (supports * wildcards, or use '*' for all entries)
   * @returns Map of matching entries (key -> value)
   *
   * @example
   * // Get all organization entries
   * const orgs = await cache.getAll<OrgData>('organizations:*')
   * for (const [key, org] of orgs) {
   *   console.log(`${key}: ${org.name}`)
   * }
   *
   * @example
   * // Get all entries with this cache's prefix
   * const all = await cache.getAll<unknown>('*')
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
   * @throws {TypeError} If key contains wildcards (*)
   */
  set<T>(key: string, data: T): Promise<void>
  /**
   * Delete a specific cache entry.
   *
   * @param key - Cache key (must not contain wildcards)
   * @throws {TypeError} If key contains wildcards (*)
   */
  delete(key: string): Promise<void>
  /**
   * Delete all cache entries matching a pattern.
   * Supports wildcards (*) for flexible matching.
   *
   * @param pattern - Key pattern (supports * wildcards, or omit to delete all)
   * @returns Number of entries deleted
   *
   * @example
   * // Delete all entries with this cache's prefix
   * await cache.deleteAll()
   *
   * @example
   * // Delete entries matching prefix
   * await cache.deleteAll('organizations')
   *
   * @example
   * // Delete entries with wildcard pattern
   * await cache.deleteAll('scans:abc*')
   * await cache.deleteAll('npm/lodash/*')
   */
  deleteAll(pattern?: string | undefined): Promise<number>
  /**
   * Clear all cache entries (like Map.clear()).
   * Optionally clear only in-memory cache.
   *
   * @param options - Optional configuration
   * @param options.memoOnly - If true, only clears in-memory cache
   *
   * @example
   * // Clear everything (memory + disk)
   * await cache.clear()
   *
   * @example
   * // Clear only in-memory cache (force refresh)
   * await cache.clear({ memoOnly: true })
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
   * @default 5 * 60 * 1000 (5 minutes)
   */
  ttl?: number | undefined
  /**
   * Enable in-memory memoization for hot data.
   * @default true
   */
  memoize?: boolean | undefined
  /**
   * Maximum number of entries to keep in the in-memory memo cache. When
   * exceeded, the least-recently-used entry is evicted. The persistent
   * (cacache) layer is unaffected.
   * @default 1000
   */
  memoMaxSize?: number | undefined
  /**
   * Custom cache key prefix.
   * Must not contain wildcards (*).
   * Use clear({ prefix: "pattern*" }) for wildcard matching instead.
   *
   * @default 'ttl-cache'
   * @throws {TypeError} If prefix contains wildcards
   *
   * @example
   * // Valid
   * createTtlCache({ prefix: 'socket-sdk' })
   * createTtlCache({ prefix: 'my-app:cache' })
   *
   * @example
   * // Invalid - throws TypeError
   * createTtlCache({ prefix: 'socket-*' })
   */
  prefix?: string | undefined
}

// 5 minutes
const DEFAULT_TTL_MS = 5 * 60 * 1000
const DEFAULT_PREFIX = 'ttl-cache'
// Cap the in-memory memoization layer. Without this, a long-running
// daemon (devserver, editor extension) that queries many distinct keys
// accumulates entries forever — expired entries are only reclaimed when
// that exact key is read again. Cacache on disk is unaffected.
const DEFAULT_MEMO_MAX_SIZE = 1000

/**
 * Create a TTL-based cache instance.
 *
 * @example
 * ```typescript
 * const cache = createTtlCache({ ttl: 60_000, prefix: 'my-app' })
 * await cache.set('key', { value: 42 })
 * const data = await cache.get('key') // { value: 42 }
 * ```
 */
export function createTtlCache(options?: TtlCacheOptions): TtlCache {
  const opts = {
    __proto__: null,
    memoize: true,
    memoMaxSize: DEFAULT_MEMO_MAX_SIZE,
    prefix: DEFAULT_PREFIX,
    ttl: DEFAULT_TTL_MS,
    ...options,
  } as Required<TtlCacheOptions>

  // Validate prefix does not contain wildcards.
  if (opts.prefix?.includes('*')) {
    throw new TypeErrorCtor(
      'Cache prefix cannot contain wildcards (*). Use clear({ prefix: "pattern*" }) for wildcard matching.',
    )
  }

  // In-memory cache for hot data. Capped via opts.memoMaxSize using a
  // Map's insertion-order semantics as the LRU list: `memoSet` deletes
  // the key first so a re-insert moves it to the tail, and when size
  // exceeds the cap we evict the oldest entry (first key in iteration).
  const memoCache = new MapCtor<string, TtlCacheEntry<unknown>>()
  const memoMaxSize = MathMax(1, opts.memoMaxSize ?? DEFAULT_MEMO_MAX_SIZE)

  function memoSet(fullKey: string, entry: TtlCacheEntry<unknown>): void {
    if (memoCache.has(fullKey)) {
      memoCache.delete(fullKey)
    } else if (memoCache.size >= memoMaxSize) {
      // Evict the least-recently-used entry (oldest insertion).
      const oldest = memoCache.keys().next().value
      if (oldest !== undefined) {
        memoCache.delete(oldest)
      }
    }
    memoCache.set(fullKey, entry)
  }

  // Ensure ttl is defined
  const ttl = opts.ttl ?? DEFAULT_TTL_MS

  /**
   * Build full cache key with prefix.
   */
  function buildKey(key: string): string {
    return `${opts.prefix}:${key}`
  }

  /**
   * Check if entry is expired.
   * Also detects clock skew by treating suspiciously far-future expiresAt as expired.
   */
  function isExpired(entry: TtlCacheEntry<unknown>): boolean {
    const now = DateNow()
    // Detect future expiresAt (clock skew or corruption).
    // If expiresAt is more than 10 seconds past expected expiry, treat as expired.
    const maxFutureMs = 10_000
    if (entry.expiresAt > now + ttl + maxFutureMs) {
      return true
    }
    return now > entry.expiresAt
  }

  /**
   * Create a matcher function for a pattern (with wildcard support).
   * Returns a function that tests if a key matches the pattern.
   */
  function createMatcher(pattern: string): (key: string) => boolean {
    const fullPattern = buildKey(pattern)
    const hasWildcard = pattern.includes('*')

    if (!hasWildcard) {
      // Simple prefix matching (fast path).
      return (key: string) => StringPrototypeStartsWith(key, fullPattern)
    }

    // Wildcard matching with regex. Anchor both ends so `foo*bar` matches
    // exactly `foo<anything>bar` and not `foo<anything>bar<anything else>`.
    // Missing the `$` anchor let `deleteAll('foo*bar')` also sweep
    // `foo123bar-extra`, which silently over-deletes.
    const escaped = StringPrototypeReplaceAll(
      fullPattern,
      /[.+?^${}()|[\]\\]/g,
      '\\$&',
    )
    const regexPattern = StringPrototypeReplaceAll(escaped, '*', '.*')
    const regex = new RegExpCtor(`^${regexPattern}$`)
    return (key: string) => regex.test(key)
  }

  /**
   * Get cached data without fetching.
   *
   * @throws {TypeError} If key contains wildcards (*)
   */
  async function get<T>(key: string): Promise<T | undefined> {
    if (key.includes('*')) {
      throw new TypeErrorCtor(
        'Cache key cannot contain wildcards (*). Use getAll(pattern) to retrieve multiple entries.',
      )
    }

    const fullKey = buildKey(key)

    // Check in-memory cache first.
    if (opts.memoize) {
      const memoEntry = memoCache.get(fullKey)
      if (memoEntry && !isExpired(memoEntry)) {
        // Bump recency so the LRU eviction prefers colder entries.
        memoSet(fullKey, memoEntry)
        return memoEntry.data as T
      }
      // Remove expired memo entry.
      if (memoEntry) {
        memoCache.delete(fullKey)
      }
    }

    // Check persistent cache.
    const cacheEntry = await cacache.safeGet(fullKey)
    if (cacheEntry) {
      let entry: TtlCacheEntry<T>
      try {
        entry = JSONParse(cacheEntry.data.toString('utf8')) as TtlCacheEntry<T>
      } catch {
        // Corrupted cache entry, treat as miss and remove.
        try {
          await cacache.remove(fullKey)
        } catch {
          // Ignore removal errors.
        }
        return undefined
      }
      if (!isExpired(entry)) {
        // Update in-memory cache.
        if (opts.memoize) {
          memoSet(fullKey, entry)
        }
        return entry.data
      }
      // Remove expired entry.
      try {
        await cacache.remove(fullKey)
      } catch {
        // Ignore removal errors - entry may not exist in persistent cache
        // or cache directory may not be accessible (e.g., during test setup).
      }
    }

    return undefined
  }

  /**
   * Get all cached entries matching a pattern.
   * Supports wildcards (*) for flexible matching.
   */
  async function getAll<T>(pattern: string): Promise<Map<string, T>> {
    const results = new MapCtor<string, T>()
    const matches = createMatcher(pattern)

    // Check in-memory cache first.
    if (opts.memoize) {
      for (const [key, entry] of memoCache.entries()) {
        if (!matches(key)) {
          continue
        }

        // Skip if expired.
        if (isExpired(entry)) {
          memoCache.delete(key)
          continue
        }

        // Add to results (strip cache prefix from key).
        const originalKey = opts.prefix
          ? key.slice(opts.prefix.length + 1)
          : key
        results.set(originalKey, entry.data as T)
      }
    }

    // Check persistent cache for entries not in memory.
    const cacheDir = (await import('./paths/socket')).getSocketCacacheDir()
    const cacacheModule = await import('./cacache')
    const stream = cacacheModule.getCacache().ls.stream(cacheDir)

    for await (const cacheEntry of stream) {
      // Skip if doesn't match our cache prefix.
      if (!cacheEntry.key.startsWith(`${opts.prefix}:`)) {
        continue
      }

      // Skip if doesn't match pattern.
      if (!matches(cacheEntry.key)) {
        continue
      }

      // Skip if already in results (from memory).
      const originalKey = opts.prefix
        ? cacheEntry.key.slice(opts.prefix.length + 1)
        : cacheEntry.key
      if (results.has(originalKey)) {
        continue
      }

      // Get entry from cache.
      try {
        const entry = await cacache.safeGet(cacheEntry.key)
        if (!entry) {
          continue
        }

        const parsed = JSONParse(
          entry.data.toString('utf8'),
        ) as TtlCacheEntry<T>

        // Skip if expired.
        if (isExpired(parsed)) {
          await cacache.remove(cacheEntry.key)
          continue
        }

        // Add to results.
        results.set(originalKey, parsed.data)

        // Update in-memory cache.
        if (opts.memoize) {
          memoSet(cacheEntry.key, parsed)
        }
      } catch {
        // Ignore parse errors or other issues.
      }
    }

    return results
  }

  /**
   * Set cached data with TTL.
   *
   * @throws {TypeError} If key contains wildcards (*)
   */
  async function set<T>(key: string, data: T): Promise<void> {
    if (key.includes('*')) {
      throw new TypeErrorCtor(
        'Cache key cannot contain wildcards (*). Wildcards are only supported in clear({ prefix: "pattern*" }).',
      )
    }

    const fullKey = buildKey(key)
    const entry: TtlCacheEntry<T> = {
      data,
      expiresAt: DateNow() + ttl,
    }

    // Update in-memory cache first (synchronous and fast).
    if (opts.memoize) {
      memoSet(fullKey, entry)
    }

    // Update persistent cache (don't fail if this errors).
    // In-memory cache is already updated, so immediate reads will succeed.
    try {
      await cacache.put(fullKey, JSON.stringify(entry), {
        metadata: { expiresAt: entry.expiresAt },
      })
    } catch {
      // Ignore persistent cache errors - in-memory cache is the source of truth.
      // This can happen during test setup or if the cache directory is not accessible.
    }
  }

  // Track in-flight fetch requests to prevent duplicate fetches
  const inflightRequests = new MapCtor<string, Promise<unknown>>()

  /**
   * Get cached data or fetch and cache if missing/expired.
   * Deduplicates concurrent requests with the same key.
   */
  async function getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const fullKey = buildKey(key)

    // Join an in-flight fetch before touching the persistent cache. If we
    // did the `await get(key)` first, two concurrent callers on a cold
    // key would both suspend on the same disk read, both see no cached
    // value, both skip this check, and both fire `fetcher()` — the exact
    // thundering-herd the inflight map is supposed to prevent.
    const preexisting = inflightRequests.get(fullKey)
    if (preexisting) {
      return (await preexisting) as T
    }

    const cached = await get<T>(key)
    if (cached !== undefined) {
      return cached
    }

    // Re-check after the await: another caller may have registered an
    // in-flight fetch while we were reading the persistent cache.
    const rechecked = inflightRequests.get(fullKey)
    if (rechecked) {
      return (await rechecked) as T
    }

    // Create promise with cleanup handlers
    const promise = (async () => {
      try {
        const data = await fetcher()
        await set(key, data)
        return data
      } finally {
        // Clean up on both success and error
        inflightRequests.delete(fullKey)
      }
    })()

    // Register before awaiting so subsequent callers join this fetch.
    inflightRequests.set(fullKey, promise)

    // Await and return (cleanup happens in finally block)
    return await promise
  }

  /**
   * Delete a specific cache entry.
   *
   * @throws {TypeError} If key contains wildcards (*)
   */
  async function deleteEntry(key: string): Promise<void> {
    if (key.includes('*')) {
      throw new TypeErrorCtor(
        'Cache key cannot contain wildcards (*). Use deleteAll(pattern) to remove multiple entries.',
      )
    }

    const fullKey = buildKey(key)
    memoCache.delete(fullKey)
    try {
      await cacache.remove(fullKey)
    } catch {
      // Ignore removal errors - entry may not exist or cache may be inaccessible.
    }
  }

  /**
   * Delete all cache entries matching a pattern.
   * Supports wildcards (*) in patterns.
   * Delegates to cacache.clear() which handles pattern matching efficiently.
   */
  async function deleteAll(pattern?: string | undefined): Promise<number> {
    // Build full prefix/pattern by combining cache prefix with optional pattern.
    const fullPrefix = pattern ? `${opts.prefix}:${pattern}` : opts.prefix

    // Delete matching in-memory entries.
    if (!pattern) {
      // Delete all in-memory entries for this cache.
      memoCache.clear()
    } else {
      // Delete matching in-memory entries using shared matcher logic.
      const matches = createMatcher(pattern)
      for (const key of memoCache.keys()) {
        if (matches(key)) {
          memoCache.delete(key)
        }
      }
    }

    // Delete matching persistent cache entries.
    // Delegate to cacache.clear() which handles wildcards efficiently.
    const removed = await cacache.clear({ prefix: fullPrefix })
    return (removed ?? 0) as number
  }

  /**
   * Clear all cache entries (like Map.clear()).
   * Optionally clear only in-memory cache.
   */
  async function clear(options?: ClearOptions | undefined): Promise<void> {
    const opts = { __proto__: null, ...options } as ClearOptions

    // Clear in-memory cache.
    memoCache.clear()

    // If memoOnly, stop here.
    if (opts.memoOnly) {
      return
    }

    // Clear persistent cache.
    await deleteAll()
  }

  return {
    clear,
    delete: deleteEntry,
    deleteAll,
    get,
    getAll,
    getOrFetch,
    set,
  }
}
