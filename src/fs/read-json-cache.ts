/**
 * @file Process-scoped LRU cache for `readJson` / `readJsonSync` results, keyed
 *   by absolute path + stat (`ino + size + mtimeMs`). Why default-on caching is
 *   safe:
 *
 *   - Stat-validated keys: a `stat()` call before serving a cache hit ensures the
 *     file hasn't changed (mtime + size mismatch ⇒ cache miss, re-read).
 *   - Defensive clone on hit: every hit returns a JSON round-trip clone
 *     (`JSON.parse(JSON.stringify(parsed))`) so callers can mutate the returned
 *     object without poisoning the cache for the next reader. The clone cost is
 *     far less than re-read + re-parse for anything bigger than a trivial JSON
 *     document, and the round-trip is faster than `structuredClone` over the
 *     JSON subset these values always belong to.
 *   - Reviver opt-out: when the caller passes a `reviver` function, we skip the
 *     cache. Function identity isn't safely hashable across boundaries, and the
 *     reviver can produce a different shape from the same bytes.
 *   - Per-call escape hatch: `cache: false` in the options bypasses the cache for
 *     cases where staleness must be observed (file-watcher tooling, etc.).
 *   - Bounded growth: an LRU cap (default 256 entries) protects long-running
 *     daemons. Tunable via `SOCKET_LIB_READ_JSON_CACHE_MAX` env or
 *     `setReadJsonCacheMax()`.
 *   - Test escape hatch: `clearReadJsonCache()` resets the whole cache between
 *     test cases that rely on fresh reads. Not cached:
 *   - Read failures (ENOENT under `throws: false` returns `undefined`). Caching
 *     undefined would silently miss a file that gets created later.
 *   - Reads with a `reviver` (see above).
 *   - Reads with explicit `cache: false`.
 *   - Relative paths whose `resolvePath` would change CWD-sensitively. We key on
 *     the literal input path, so callers passing relative paths from different
 *     CWDs would get separate cache entries — correct but pessimistic.
 */

import process from 'node:process'

import { DateNow } from '../primordials/date'
import { ErrorCtor } from '../primordials/error'
import { JSONParse, JSONStringify } from '../primordials/json'
import { MapCtor } from '../primordials/map-set'
import { NumberIsFinite, NumberParseInt } from '../primordials/number'

import type { JsonValue } from '../json/types'

const DEFAULT_MAX_ENTRIES = 256
const DEFAULT_TTL_MS = 5 * 60 * 1000

export interface CacheEntry {
  ino: number
  size: number
  mtimeMs: number
  parsed: JsonValue
  // Wall-clock timestamp (Date.now()) at insertion. Used by the TTL
  // eviction sweep — independent of mtimeMs, which is the file's own
  // modification time on disk.
  insertedAt: number
}

// Insertion-ordered Map gives LRU-ish behavior when we delete + reinsert on
// access. Not strictly LRU (we'd need access-order tracking on hit too) but
// "most-recently-set wins" is the dominant pattern for stat-validated caches.
const cache = new MapCtor<string, CacheEntry>()

let cacheMax = readMaxFromEnv()
let cacheTtlMs = readTtlFromEnv()
let hits = 0
let misses = 0

/**
 * Drop all cached entries. Tests call this between cases that depend on a fresh
 * read; long-running daemons can call it on file-watcher invalidation events
 * for paths the daemon knows are about to change in bulk.
 */
export function clearReadJsonCache(): void {
  cache.clear()
  hits = 0
  misses = 0
}

/**
 * Look up a cached parse result. Returns a fresh structured clone on hit (so
 * callers can mutate freely), or `undefined` on miss.
 *
 * @param key Cache key — absolute file path. Caller resolves any relative
 *   inputs to absolute so two different CWDs don't share an entry.
 * @param ino Inode (or `0` on platforms without one — Windows reports 0 from
 *   the Node `fs.Stats` shim, in which case size + mtimeMs carry the
 *   invalidation signal).
 * @param size File size in bytes.
 * @param mtimeMs Modification time in milliseconds.
 */
export function getCachedJson(
  key: string,
  ino: number,
  size: number,
  mtimeMs: number,
): JsonValue | undefined {
  const entry = cache.get(key)
  if (!entry) {
    misses += 1
    return undefined
  }
  // TTL check first — a too-old entry is dropped without consulting stat,
  // since the stat-based validation is itself one syscall the caller is
  // about to do. Skip when ttl is 0 (disabled).
  if (cacheTtlMs > 0 && DateNow() - entry.insertedAt > cacheTtlMs) {
    cache.delete(key)
    misses += 1
    return undefined
  }
  if (entry.ino !== ino || entry.size !== size || entry.mtimeMs !== mtimeMs) {
    // Stale on disk — drop and miss.
    cache.delete(key)
    misses += 1
    return undefined
  }
  hits += 1
  return JSONParse(JSONStringify(entry.parsed)) as JsonValue
}

/**
 * Snapshot diagnostics. Useful for tests and for tooling that wants to log
 * cache effectiveness at end of run.
 */
export function getReadJsonCacheStats(): {
  size: number
  max: number
  ttlMs: number
  hits: number
  misses: number
} {
  return {
    size: cache.size,
    max: cacheMax,
    ttlMs: cacheTtlMs,
    hits,
    misses,
  }
}

export function readMaxFromEnv(): number {
  const env = process.env['SOCKET_LIB_READ_JSON_CACHE_MAX']
  if (env) {
    const n = NumberParseInt(env, 10)
    if (n > 0 && NumberIsFinite(n)) {
      return n
    }
  }
  return DEFAULT_MAX_ENTRIES
}

export function readTtlFromEnv(): number {
  const env = process.env['SOCKET_LIB_READ_JSON_CACHE_TTL_MS']
  if (env) {
    const n = NumberParseInt(env, 10)
    // Allow `0` (disabled — entries never expire by time alone; LRU cap
    // is the only ejection trigger).
    if (n >= 0 && NumberIsFinite(n)) {
      return n
    }
  }
  return DEFAULT_TTL_MS
}

/**
 * Store a parsed value. Evicts the oldest entry when the cache is full.
 *
 * Never stores `undefined` — callers must guard for the "file not found,
 * throws: false" case before invoking this.
 */
export function setCachedJson(
  key: string,
  ino: number,
  size: number,
  mtimeMs: number,
  parsed: JsonValue,
): void {
  if (cache.size >= cacheMax) {
    // Evict the oldest entry. Map iteration is insertion-ordered, so
    // `keys().next()` gives the eldest.
    const oldest = cache.keys().next().value
    if (oldest !== undefined) {
      cache.delete(oldest)
    }
  }
  // Clone on insert too. The caller still holds a reference to `parsed`
  // (we returned it from readJson), so storing the raw reference would
  // let caller mutations bleed into the cached object. Clone-on-insert
  // + clone-on-hit gives full isolation.
  cache.set(key, {
    ino,
    size,
    mtimeMs,
    parsed: JSONParse(JSONStringify(parsed)) as JsonValue,
    insertedAt: DateNow(),
  })
}

/**
 * Adjust the cache size cap at runtime. Useful for tooling that knows it'll
 * walk many manifests in one pass and wants a larger cap, or for tests that
 * want to bound the cap small so eviction is observable.
 *
 * Trims excess entries on shrink.
 */
export function setReadJsonCacheMax(max: number): void {
  if (max <= 0 || !NumberIsFinite(max)) {
    throw new ErrorCtor(
      `setReadJsonCacheMax: max must be a positive finite number, got ${max}`,
    )
  }
  cacheMax = max
  while (cache.size > cacheMax) {
    const oldest = cache.keys().next().value
    if (oldest === undefined) {
      break
    }
    cache.delete(oldest)
  }
}

/**
 * Adjust the time-based ejection window at runtime. Default is 5 minutes; pass
 * `0` to disable time-based ejection entirely (entries then live until LRU
 * eviction or `clearReadJsonCache`).
 */
export function setReadJsonCacheTtlMs(ttlMs: number): void {
  if (ttlMs < 0 || !NumberIsFinite(ttlMs)) {
    throw new ErrorCtor(
      `setReadJsonCacheTtlMs: ttlMs must be a non-negative finite number, got ${ttlMs}`,
    )
  }
  cacheTtlMs = ttlMs
}
