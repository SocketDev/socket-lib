/**
 * @file `createBrowserTtlCache` — browser-safe sibling of `createTtlCache`
 *   (`./store`). Same two-tier design and `TtlCache` contract, but the
 *   persistent tier is an injected `TtlCacheStorage` adapter (wrap
 *   `chrome.storage.local`, `sessionStorage` / `localStorage`, IndexedDB, …)
 *   instead of cacache, so the module's import graph stays primordials-only —
 *   safe for Chrome MV3 service workers, content scripts, popups, and web
 *   workers. Shared semantics live in `./_internal` (one owner, so the node
 *   and browser stores cannot drift): TTL default, clock-skew detection, LRU
 *   memo eviction via Map insertion order, prefix namespacing, wildcard
 *   matching. `getOrFetch` deduplicates concurrent fetches for the same key
 *   (thundering-herd protection), and single-key methods throw on `*`.
 *   Differences from `./store` (cacache-specific pieces that don't map):
 *
 *   - No cacache `ls.stream` — `getAll` / `deleteAll` / `clear` enumerate the
 *     persistent tier only when the adapter provides the optional `keys()`
 *     (e.g. `chrome.storage.local.get(null)`, `sessionStorage.key(i)`). Without
 *     it they still cover the memo tier, and delete those memo keys from
 *     storage too; storage-only entries from previous sessions are then
 *     unreachable by wildcard but still expire per-entry on read.
 *   - No storage supplied ⇒ memo-only cache (all operations stay correct).
 *   - A corrupt or shape-invalid storage entry is treated as a miss and deleted
 *     best-effort; storage failures never throw — the memo tier is the source
 *     of truth, mirroring store.ts's cacache error handling.
 */

import { DateNow } from '../../primordials/date'
import { TypeErrorCtor } from '../../primordials/error'
import { JSONParse, JSONStringify } from '../../primordials/json'
import { MapCtor, SetCtor } from '../../primordials/map-set'
import { MathMax } from '../../primordials/math'
import {
  StringPrototypeIncludes,
  StringPrototypeSlice,
  StringPrototypeStartsWith,
} from '../../primordials/string'

import {
  createKeyMatcher,
  DEFAULT_MEMO_MAX_SIZE,
  DEFAULT_PREFIX,
  DEFAULT_TTL_MS,
  isExpiredEntry,
  lruSet,
} from './_internal'

import type {
  BrowserTtlCacheOptions,
  ClearOptions,
  TtlCache,
  TtlCacheEntry,
} from './types'

/**
 * Create a browser-safe TTL cache instance. Same contract as
 * `createTtlCache`, with the persistent tier backed by the injected
 * `storage` adapter (or absent, for a memo-only cache).
 *
 * @example
 *   ;```typescript
 *   const cache = createBrowserTtlCache({
 *     prefix: 'my-extension',
 *     storage: {
 *       async getItem(key) {
 *         return (await chrome.storage.local.get(key))[key]
 *       },
 *       async keys() {
 *         return Object.keys(await chrome.storage.local.get(null))
 *       },
 *       async removeItem(key) {
 *         await chrome.storage.local.remove(key)
 *       },
 *       async setItem(key, value) {
 *         await chrome.storage.local.set({ [key]: value })
 *       },
 *     },
 *     ttl: 60_000,
 *   })
 *   await cache.set('key', { value: 42 })
 *   const data = await cache.get('key') // { value: 42 }
 *   ```
 */
export function createBrowserTtlCache(
  options?: BrowserTtlCacheOptions | undefined,
): TtlCache {
  const opts = {
    __proto__: null,
    memoize: true,
    memoMaxSize: DEFAULT_MEMO_MAX_SIZE,
    prefix: DEFAULT_PREFIX,
    storage: undefined,
    ttl: DEFAULT_TTL_MS,
    ...options,
  } as BrowserTtlCacheOptions &
    Required<Omit<BrowserTtlCacheOptions, 'storage'>>

  // Validate prefix does not contain wildcards.
  if (opts.prefix?.includes('*')) {
    throw new TypeErrorCtor(
      'Cache prefix cannot contain wildcards (*). Use clear({ prefix: "pattern*" }) for wildcard matching.',
    )
  }

  const { storage } = opts

  // In-memory cache for hot data. Capped via opts.memoMaxSize using a
  // Map's insertion-order semantics as the LRU list (see `lruSet`).
  const memoCache = new MapCtor<string, TtlCacheEntry<unknown>>()
  const memoMaxSize = MathMax(1, opts.memoMaxSize ?? DEFAULT_MEMO_MAX_SIZE)
  const prefix = opts.prefix ?? DEFAULT_PREFIX
  const ttl = opts.ttl ?? DEFAULT_TTL_MS
  const fullPrefix = `${prefix}:`

  /**
   * Build full cache key with prefix.
   */
  function buildKey(key: string): string {
    return `${fullPrefix}${key}`
  }

  /**
   * Best-effort deletion from the storage adapter — failures are swallowed.
   */
  async function removeQuietly(fullKey: string): Promise<void> {
    if (!storage) {
      return
    }
    try {
      await storage.removeItem(fullKey)
    } catch {
      // Ignore removal errors - entry may not exist or storage may be
      // inaccessible.
    }
  }

  /**
   * List the storage adapter's keys via its optional `keys()`. Returns an
   * empty list when the adapter has no enumeration or when it fails.
   */
  async function listStorageKeys(): Promise<string[]> {
    if (!storage?.keys) {
      return []
    }
    try {
      return await storage.keys()
    } catch {
      return []
    }
  }

  /**
   * Read + parse + validate one entry from the storage adapter. Returns the
   * live entry, or undefined on miss / corrupt / shape-invalid / expired —
   * deleting dead entries best-effort.
   */
  async function readStorageEntry<T>(
    fullKey: string,
  ): Promise<TtlCacheEntry<T> | undefined> {
    if (!storage) {
      return undefined
    }
    let raw: string | null | undefined
    try {
      raw = await storage.getItem(fullKey)
    } catch {
      // Read failure is a miss - the memo tier is the source of truth.
      return undefined
    }
    if (typeof raw !== 'string') {
      return undefined
    }
    let parsed: unknown
    try {
      parsed = JSONParse(raw)
    } catch {
      // Corrupted cache entry, treat as miss and delete.
      await removeQuietly(fullKey)
      return undefined
    }
    if (
      parsed === null ||
      typeof parsed !== 'object' ||
      typeof (parsed as { expiresAt?: unknown | undefined }).expiresAt !==
        'number'
    ) {
      // Shape-invalid entry (tampered or foreign write), same treatment.
      await removeQuietly(fullKey)
      return undefined
    }
    const entry = parsed as TtlCacheEntry<T>
    if (isExpiredEntry(entry, ttl)) {
      await removeQuietly(fullKey)
      return undefined
    }
    return entry
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
      if (memoEntry && !isExpiredEntry(memoEntry, ttl)) {
        // Bump recency so the LRU eviction prefers colder entries.
        lruSet(memoCache, memoMaxSize, fullKey, memoEntry)
        return memoEntry.data as T
      }
      // Drop expired memo entry.
      if (memoEntry) {
        memoCache.delete(fullKey)
      }
    }

    // Check persistent tier.
    const entry = await readStorageEntry<T>(fullKey)
    if (entry) {
      // Update in-memory cache.
      if (opts.memoize) {
        lruSet(memoCache, memoMaxSize, fullKey, entry)
      }
      return entry.data
    }

    return undefined
  }

  async function getAll<T>(pattern: string): Promise<Map<string, T>> {
    const results = new MapCtor<string, T>()
    const matches = createKeyMatcher(prefix, pattern)

    if (opts.memoize) {
      for (const { 0: fullKey, 1: entry } of memoCache.entries()) {
        if (!matches(fullKey)) {
          continue
        }
        if (isExpiredEntry(entry, ttl)) {
          memoCache.delete(fullKey)
          continue
        }
        results.set(
          StringPrototypeSlice(fullKey, fullPrefix.length),
          entry.data as T,
        )
      }
    }

    // Check the persistent tier for entries not in memory. Requires the
    // adapter's optional keys() enumeration.
    for (const fullKey of await listStorageKeys()) {
      // Skip foreign keys in shared storage and non-matching keys.
      if (
        !StringPrototypeStartsWith(fullKey, fullPrefix) ||
        !matches(fullKey)
      ) {
        continue
      }
      const originalKey = StringPrototypeSlice(fullKey, fullPrefix.length)
      // Skip if already in results (from memory).
      if (results.has(originalKey)) {
        continue
      }
      const entry = await readStorageEntry<T>(fullKey)
      if (!entry) {
        continue
      }
      results.set(originalKey, entry.data)
      // Update in-memory cache.
      if (opts.memoize) {
        lruSet(memoCache, memoMaxSize, fullKey, entry)
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
      lruSet(memoCache, memoMaxSize, fullKey, entry)
    }

    // Update the persistent tier (don't fail if this errors).
    if (storage) {
      try {
        await storage.setItem(fullKey, JSONStringify(entry))
      } catch {
        // Ignore storage errors - the in-memory cache is the source of truth.
      }
    }
  }

  // Track in-flight fetch requests to prevent duplicate fetches.
  const inflightRequests = new MapCtor<string, Promise<unknown>>()

  async function getOrFetch<T>(
    key: string,
    fetcher: () => Promise<T>,
  ): Promise<T> {
    const fullKey = buildKey(key)

    const preexisting = inflightRequests.get(fullKey)
    if (preexisting) {
      return (await preexisting) as T
    }

    const cached = await get<T>(key)
    if (cached !== undefined) {
      return cached
    }

    // A concurrent caller may have registered a fetch while `get` awaited.
    const rechecked = inflightRequests.get(fullKey)
    if (rechecked) {
      return (await rechecked) as T
    }

    // Create promise with cleanup handlers.
    const promise = (async () => {
      try {
        const data = await fetcher()
        await set(key, data)
        return data
      } finally {
        // Clean up on both success and error so failures retry.
        inflightRequests.delete(fullKey)
      }
    })()

    // Register before awaiting so subsequent callers join this fetch.
    inflightRequests.set(fullKey, promise)

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
    await removeQuietly(fullKey)
  }

  async function deleteAll(pattern?: string | undefined): Promise<number> {
    const matches = pattern ? createKeyMatcher(prefix, pattern) : undefined

    // Collect matching keys from the memo tier plus the adapter's optional
    // enumeration, then delete from both tiers. The count is the number of
    // distinct full keys deleted.
    const removedKeys = new SetCtor<string>()

    for (const fullKey of memoCache.keys()) {
      if (!matches || matches(fullKey)) {
        removedKeys.add(fullKey)
      }
    }
    for (const fullKey of await listStorageKeys()) {
      if (!StringPrototypeStartsWith(fullKey, fullPrefix)) {
        continue
      }
      if (!matches || matches(fullKey)) {
        removedKeys.add(fullKey)
      }
    }

    for (const fullKey of removedKeys) {
      memoCache.delete(fullKey)
      await removeQuietly(fullKey)
    }
    return removedKeys.size
  }

  async function clear(clearOptions?: ClearOptions | undefined): Promise<void> {
    const clearOpts = { __proto__: null, ...clearOptions } as ClearOptions

    // If memoOnly, clear the in-memory cache and stop.
    if (clearOpts.memoOnly) {
      memoCache.clear()
      return
    }

    // Clear both tiers.
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
