/**
 * @fileoverview Bulk-clear entries from the Socket shared cacache —
 * `clear()` plus its wildcard helper `createPatternMatcher`. The
 * helper is exported because callers occasionally compose their own
 * filtering pipelines.
 */

import { getSocketCacacheDir } from '../paths/socket'
import { RegExpCtor, RegExpPrototypeTest } from '../primordials/regexp'
import { StringPrototypeReplaceAll, StringPrototypeStartsWith } from '../primordials/string'

import { getCacache } from './_internal'

import type { RemoveOptions } from './types'

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

  // Compile the matcher once outside the stream loop. For non-wildcard
  // prefixes the matcher is a cheap startsWith; for wildcards it's a
  // pre-anchored regex. Either way, key-matching is O(1)-per-key in the
  // hot loop instead of re-evaluating the regex per entry.
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
        // Ignore individual removal errors (e.g., already removed by another process).
      }
    }
  }

  return removed
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
export function createPatternMatcher(
  pattern: string,
): (key: string) => boolean {
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
  return (key: string) => RegExpPrototypeTest(regex, key)
}
