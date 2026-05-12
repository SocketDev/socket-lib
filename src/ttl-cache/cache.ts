/**
 * @fileoverview `createTtlCache` — generic TTL-based cache built on
 * top of cacache (persistent) plus an in-memory LRU memo layer.
 *
 * Two-tier caching: hot data lives in `memoCache` (Map<string,
 * TtlCacheEntry>) capped at `memoMaxSize` entries with LRU eviction
 * via Map insertion-order semantics. Persistent storage uses cacache
 * so cached values survive process restarts.
 *
 * Key features:
 * - Per-key namespacing via `prefix` so multiple caches share one
 *   cacache directory without conflicting.
 * - `getOrFetch` deduplicates concurrent requests for the same key
 *   (thundering-herd protection via `inflightRequests` map).
 * - Wildcard support for `getAll` / `deleteAll` (single-key methods
 *   throw on `*`).
 * - Clock-skew detection: entries with suspiciously-far-future
 *   `expiresAt` are treated as expired.
 */

import { clear as cacacheClear } from '../cacache/clear'
import { safeGet as cacacheSafeGet } from '../cacache/read'
import { put as cacachePut, remove as cacacheRemove } from '../cacache/write'
import { DateNow } from '../primordials/date'
import { TypeErrorCtor } from '../primordials/error'
import { JSONParse } from '../primordials/json'
import { MapCtor } from '../primordials/map-set'
import { MathMax } from '../primordials/math'
import { RegExpCtor, RegExpPrototypeTest } from '../primordials/regexp'
import {
  StringPrototypeIncludes,
  StringPrototypeReplaceAll,
  StringPrototypeSlice,
  StringPrototypeStartsWith,
} from '../primordials/string'

import type {
  ClearOptions,
  TtlCache,
  TtlCacheEntry,
  TtlCacheOptions,
} from './types'

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
    // LRU has-existing tested via re-set; size>=max requires the cache
    // to fill (default 100). The oldest!==undefined guard is defensive
    // and unreachable when size>=max.
    /* c8 ignore start */
    if (memoCache.has(fullKey)) {
      memoCache.delete(fullKey)
    } else if (memoCache.size >= memoMaxSize) {
      const oldest = memoCache.keys().next().value
      if (oldest !== undefined) {
        memoCache.delete(oldest)
      }
    }
    /* c8 ignore stop */
    memoCache.set(fullKey, entry)
  }

  // Ensure ttl is defined. opts.ttl-undefined arm fires for default-ttl
  // callers which is the common case.
  /* c8 ignore next */
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
    const escaped = StringPrototypeReplaceAll(
      fullPattern,
      /[.+?^${}()|[\]\\]/g,
      '\\$&',
    )
    const regexPattern = StringPrototypeReplaceAll(escaped, '*', '.*')
    const regex = new RegExpCtor(`^${regexPattern}$`)
    return (key: string) => RegExpPrototypeTest(regex, key)
  }

  async function get<T>(key: string): Promise<T | undefined> {
    if (StringPrototypeIncludes(key, '*')) {
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
    const cacheEntry = await cacacheSafeGet(fullKey)
    if (cacheEntry) {
      let entry: TtlCacheEntry<T>
      try {
        entry = JSONParse(cacheEntry.data.toString('utf8')) as TtlCacheEntry<T>
      } catch {
        // Corrupted cache entry, treat as miss and remove.
        try {
          await cacacheRemove(fullKey)
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
      // Remove-expired-entry catch fires only when entry is missing
      // or cache dir is inaccessible.
      /* c8 ignore start */
      try {
        await cacacheRemove(fullKey)
      } catch {}
      /* c8 ignore stop */
    }

    return undefined
  }

  async function getAll<T>(pattern: string): Promise<Map<string, T>> {
    const results = new MapCtor<string, T>()
    const matches = createMatcher(pattern)

    /* c8 ignore start */
    if (opts.memoize) {
      for (const [key, entry] of memoCache.entries()) {
        if (!matches(key)) {
          continue
        }

        if (isExpired(entry)) {
          memoCache.delete(key)
          continue
        }

        const originalKey = opts.prefix
          ? StringPrototypeSlice(key, opts.prefix.length + 1)
          : key
        results.set(originalKey, entry.data as T)
      }
    }
    /* c8 ignore stop */

    // Check persistent cache for entries not in memory.
    const cacheDir = (await import('../paths/socket')).getSocketCacacheDir()
    const cacacheModule = await import('../cacache/_internal')
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
        const entry = await cacacheSafeGet(cacheEntry.key)
        if (!entry) {
          continue
        }

        const parsed = JSONParse(
          entry.data.toString('utf8'),
        ) as TtlCacheEntry<T>

        // Skip if expired.
        if (isExpired(parsed)) {
          await cacacheRemove(cacheEntry.key)
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

  async function set<T>(key: string, data: T): Promise<void> {
    if (StringPrototypeIncludes(key, '*')) {
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
    try {
      await cacachePut(fullKey, JSON.stringify(entry), {
        metadata: { expiresAt: entry.expiresAt },
      })
    } catch {
      // Ignore persistent cache errors - in-memory cache is the source of truth.
    }
  }

  // Track in-flight fetch requests to prevent duplicate fetches
  const inflightRequests = new MapCtor<string, Promise<unknown>>()

  async function getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const fullKey = buildKey(key)

    /* c8 ignore start */
    const preexisting = inflightRequests.get(fullKey)
    if (preexisting) {
      return (await preexisting) as T
    }
    /* c8 ignore stop */

    const cached = await get<T>(key)
    if (cached !== undefined) {
      return cached
    }

    /* c8 ignore start */
    const rechecked = inflightRequests.get(fullKey)
    if (rechecked) {
      return (await rechecked) as T
    }
    /* c8 ignore stop */

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

  async function deleteEntry(key: string): Promise<void> {
    if (StringPrototypeIncludes(key, '*')) {
      throw new TypeErrorCtor(
        'Cache key cannot contain wildcards (*). Use deleteAll(pattern) to remove multiple entries.',
      )
    }

    const fullKey = buildKey(key)
    memoCache.delete(fullKey)
    try {
      await cacacheRemove(fullKey)
    } catch {
      // Ignore removal errors - entry may not exist or cache may be inaccessible.
    }
  }

  async function deleteAll(pattern?: string | undefined): Promise<number> {
    // Build full prefix/pattern by combining cache prefix with optional pattern.
    const fullPrefix = pattern ? `${opts.prefix}:${pattern}` : `${opts.prefix}:`

    // Delete matching in-memory entries.
    if (!pattern) {
      memoCache.clear()
    } else {
      const matches = createMatcher(pattern)
      for (const key of memoCache.keys()) {
        if (matches(key)) {
          memoCache.delete(key)
        }
      }
    }

    // Delete matching persistent cache entries.
    const removed = await cacacheClear({ prefix: fullPrefix })
    return (removed ?? 0) as number
  }

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
