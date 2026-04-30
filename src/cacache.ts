/** @fileoverview Cacache utilities for Socket ecosystem shared content-addressable cache. */

import cacache from './external/cacache'
import { getSocketCacacheDir } from './paths/socket'

import {
  RegExpCtor,
  StringPrototypeReplaceAll,
  StringPrototypeStartsWith,
  TypeErrorCtor,
} from './primordials'

export interface GetOptions {
  integrity?: string | undefined
  size?: number | undefined
  memoize?: boolean | undefined
}

export interface PutOptions {
  integrity?: string | undefined
  size?: number | undefined
  metadata?: unknown | undefined
  memoize?: boolean | undefined
}

export interface CacheEntry {
  data: Buffer
  integrity: string
  key: string
  metadata?: unknown | undefined
  path: string
  size: number
  time: number
}

export interface RemoveOptions {
  /**
   * Optional key prefix to filter removals.
   * If provided, only keys starting with this prefix will be removed.
   * Can include wildcards (*) for pattern matching.
   *
   * @example
   * { prefix: 'socket-sdk' } // Simple prefix
   * { prefix: 'socket-sdk:scans:abc*' } // With wildcard
   */
  prefix?: string | undefined
}

/**
 * Build a key→boolean matcher for `pattern`. For non-wildcard patterns
 * this returns a prefix-startsWith predicate (no regex allocation); for
 * wildcard patterns it compiles the regex *once* and closes over it so
 * the caller can apply the same matcher across N keys in O(1)-per-key.
 *
 * Anchors both ends — `foo*bar` matches exactly `foo<anything>bar`,
 * not `foo<anything>bar<more>`.
 */
function createPatternMatcher(pattern: string): (key: string) => boolean {
  if (!pattern.includes('*')) {
    return (key: string) => StringPrototypeStartsWith(key, pattern)
  }
  // Escape regex special characters except `*`, then convert `*` to `.*`.
  const escaped = StringPrototypeReplaceAll(
    pattern,
    /[.+?^${}()|[\]\\]/g,
    '\\$&',
  )
  const regexPattern = StringPrototypeReplaceAll(escaped, '*', '.*')
  const regex = new RegExpCtor(`^${regexPattern}$`)
  return (key: string) => regex.test(key)
}

/**
 * Clear entries from the Socket shared cache.
 *
 * Supports wildcard patterns (*) in prefix for flexible matching.
 * For simple prefixes without wildcards, uses efficient streaming.
 * For wildcard patterns, iterates and matches each entry.
 *
 * @param options - Optional configuration for selective clearing
 * @param options.prefix - Prefix or pattern to match (supports * wildcards)
 * @returns Number of entries removed (only when prefix is specified)
 *
 * @example
 * // Clear all entries
 * await clear()
 *
 * @example
 * // Clear entries with simple prefix
 * const removed = await clear({ prefix: 'socket-sdk:scans' })
 * console.log(`Removed ${removed} scan cache entries`)
 *
 * @example
 * // Clear entries with wildcard pattern
 * await clear({ prefix: 'socket-sdk:scans:abc*' })
 * await clear({ prefix: 'socket-sdk:npm/lodash/*' })
 */
export async function clear(
  options?: RemoveOptions | undefined,
): Promise<number | undefined> {
  const opts = { __proto__: null, ...options } as RemoveOptions
  const cacache = getCacache()
  const cacheDir = getSocketCacacheDir()

  // If no prefix specified, clear everything.
  if (!opts.prefix) {
    try {
      /* c8 ignore next - External cacache call */
      await cacache.rm.all(cacheDir)
      return
    } catch (e) {
      // Ignore ENOTEMPTY errors - can occur when multiple processes
      // are cleaning up concurrently (e.g., in CI test environments).
      if ((e as NodeJS.ErrnoException)?.code !== 'ENOTEMPTY') {
        throw e
      }
      return
    }
  }

  const hasWildcard = opts.prefix.includes('*')

  // For simple prefix (no wildcards), use faster iteration.
  if (!hasWildcard) {
    let removed = 0
    /* c8 ignore next - External cacache call */
    const stream = cacache.ls.stream(cacheDir)

    for await (const entry of stream) {
      if (entry.key.startsWith(opts.prefix)) {
        try {
          /* c8 ignore next - External cacache call */
          await cacache.rm.entry(cacheDir, entry.key)
          removed++
        } catch {
          // Ignore individual removal errors (e.g., already removed by another process).
        }
      }
    }

    return removed
  }

  // For wildcard patterns, need to match each entry. Compile the
  // matcher once outside the stream loop so wildcard scans are
  // O(1)-per-key instead of re-compiling the regex on every entry.
  let removed = 0
  const matches = createPatternMatcher(opts.prefix)
  /* c8 ignore next - External cacache call */
  const stream = cacache.ls.stream(cacheDir)

  for await (const entry of stream) {
    if (matches(entry.key)) {
      try {
        /* c8 ignore next - External cacache call */
        await cacache.rm.entry(cacheDir, entry.key)
        removed++
      } catch {
        // Ignore individual removal errors.
      }
    }
  }

  return removed
}

/**
 * Get data from the Socket shared cache by key.
 * @throws {Error} When cache entry is not found.
 * @throws {TypeError} If key contains wildcards (*)
 *
 * @example
 * ```typescript
 * const entry = await get('socket-sdk:scans:abc123')
 * console.log(entry.data.toString('utf8'))
 * ```
 */
export async function get(
  key: string,
  options?: GetOptions | undefined,
): Promise<CacheEntry> {
  if (key.includes('*')) {
    throw new TypeErrorCtor(
      'Cache key cannot contain wildcards (*). Wildcards are only supported in clear({ prefix: "pattern*" }).',
    )
  }
  const cacache = getCacache() as any
  /* c8 ignore next - External cacache call */
  return await cacache.get(getSocketCacacheDir(), key, options)
}

/**
 * Get the cacache module for cache operations.
 *
 * @example
 * ```typescript
 * const cacache = getCacache()
 * const entries = await cacache.ls(cacheDir)
 * ```
 */
export function getCacache() {
  // cacache is imported at the top
  return cacache
}

/**
 * Put data into the Socket shared cache with a key.
 *
 * @throws {TypeError} If key contains wildcards (*)
 *
 * @example
 * ```typescript
 * await put('socket-sdk:scans:abc123', Buffer.from('result data'))
 * ```
 */
export async function put(
  key: string,
  data: string | Buffer,
  options?: PutOptions | undefined,
) {
  if (key.includes('*')) {
    throw new TypeErrorCtor(
      'Cache key cannot contain wildcards (*). Wildcards are only supported in clear({ prefix: "pattern*" }).',
    )
  }
  const cacache = getCacache()
  /* c8 ignore next - External cacache call */
  return await cacache.put(getSocketCacacheDir(), key, data, options)
}

/**
 * Remove an entry from the Socket shared cache by key.
 *
 * @throws {TypeError} If key contains wildcards (*)
 *
 * @example
 * ```typescript
 * await remove('socket-sdk:scans:abc123')
 * ```
 */
export async function remove(key: string): Promise<unknown> {
  if (key.includes('*')) {
    throw new TypeErrorCtor(
      'Cache key cannot contain wildcards (*). Use clear({ prefix: "pattern*" }) to remove multiple entries.',
    )
  }
  const cacache = getCacache() as any
  /* c8 ignore next - External cacache call */
  return await cacache.rm.entry(getSocketCacacheDir(), key)
}

/**
 * Get data from the Socket shared cache by key without throwing.
 *
 * @example
 * ```typescript
 * const entry = await safeGet('socket-sdk:scans:abc123')
 * if (entry) {
 *   console.log(entry.data.toString('utf8'))
 * }
 * ```
 */
export async function safeGet(
  key: string,
  options?: GetOptions | undefined,
): Promise<CacheEntry | undefined> {
  try {
    return await get(key, options)
  } catch {
    return undefined
  }
}

/**
 * Execute a callback with a temporary directory for cache operations.
 *
 * @example
 * ```typescript
 * const result = await withTmp(async (tmpDir) => {
 *   // Use tmpDir for temporary cache work
 *   return 'done'
 * })
 * ```
 */
export async function withTmp<T>(
  callback: (tmpDirPath: string) => Promise<T>,
): Promise<T> {
  const cacache = getCacache()
  // The DefinitelyTyped types for cacache.tmp.withTmp are incorrect.
  // It actually returns the callback's return value, not void.
  /* c8 ignore start - External cacache call */
  return (await cacache.tmp.withTmp(
    getSocketCacacheDir(),
    {},
    callback as any,
  )) as T
  /* c8 ignore stop */
}
