/**
 * @file Read-and-parse helpers for JSON files. Wraps fs reads in actionable
 *   error messages keyed off `ENOENT` / `EACCES` / `EPERM` so callers see "JSON
 *   file not found" / "Permission denied" rather than the bare errno. Both
 *   variants honor `throws: false` to fall back to `undefined` on parse or read
 *   failure. Both variants cache parse results by default — keyed on `path +
 *   ino + size \+ mtimeMs`, with a defensive `structuredClone` on every hit so
 *   callers can mutate the returned object freely. See `_read-json-cache.ts`
 *   for the safety rationale + opt-out controls.
 */

import {
  clearReadJsonCache,
  getCachedJson,
  getReadJsonCacheStats,
  setCachedJson,
  setReadJsonCacheMax,
  setReadJsonCacheTtlMs,
} from './read-json-cache.mjs'
import { parseJson } from '../json/parse.mjs'

export {
  clearReadJsonCache,
  getReadJsonCacheStats,
  setReadJsonCacheMax,
  setReadJsonCacheTtlMs,
}
import { getNodeFs } from '../node/fs.mjs'
import { ErrorCtor } from '../primordials/error.mjs'
import { NumberCtor } from '../primordials/number.mjs'
import type { PathLike } from 'node:fs'

import type { ReadJsonOptions } from './types.mjs'

/**
 * Read and parse a JSON file asynchronously. Reads the file as UTF-8 text and
 * parses it as JSON. Optionally accepts a reviver function to transform parsed
 * values.
 *
 * @example
 *   ;```ts
 *   // Read and parse package.json
 *   const pkg = await readJson('./package.json')
 *
 *   // Read JSON with custom reviver
 *   const data = await readJson('./data.json', {
 *     reviver: (key, value) => {
 *       if (key === 'date') return new Date(value)
 *       return value
 *     },
 *   })
 *
 *   // Don't throw on parse errors
 *   const config = await readJson('./config.json', { throws: false })
 *   if (config === undefined) {
 *     console.log('Failed to parse config')
 *   }
 *   ```
 *
 * @param filepath - Path to JSON file.
 * @param options - Read and parse options.
 *
 * @returns Promise resolving to parsed JSON value, or undefined if throws is
 *   false and an error occurs.
 */
export async function readJson(
  filepath: PathLike,
  options?: ReadJsonOptions | string | undefined,
) {
  const opts = typeof options === 'string' ? { encoding: options } : options
  const { cache, reviver, throws, ...fsOptions } = {
    __proto__: null,
    ...opts,
  } as unknown as ReadJsonOptions
  const shouldThrow = throws === undefined || !!throws
  const cacheEnabled = cache !== false && reviver === undefined
  const fs = getNodeFs()
  const pathStr = String(filepath)
  // Cache-hit fast path: stat, then if the stat matches a cached entry,
  // return a structuredClone of the parsed value. The clone is what makes
  // default-on caching safe under caller mutation. Also keep this PRE-READ
  // stat around: it is the only trustworthy validity key for whatever we
  // read below, since a stat taken only AFTER the read could reflect a
  // writer's commit that landed mid-read, stamping stale content with a
  // fresh mtime that would then wrongly validate on every later call.
  let preReadStat: Awaited<ReturnType<typeof fs.promises.stat>> | undefined
  if (cacheEnabled) {
    try {
      // Need ino+size+mtime as the cache invalidation key, not existence.
      // oxlint-disable-next-line socket/prefer-exists-sync -- cache key
      const stat = await fs.promises.stat(filepath)
      preReadStat = stat
      const cached = getCachedJson(
        pathStr,
        NumberCtor(stat.ino),
        NumberCtor(stat.size),
        NumberCtor(stat.mtimeMs),
      )
      if (cached !== undefined) {
        return cached
      }
    } catch {
      // Stat failed (ENOENT etc.) - fall through to the read path so the
      // existing error-message logic surfaces the original errno.
    }
  }
  let content = ''
  try {
    content = await fs.promises.readFile(filepath, {
      __proto__: null,
      ...fsOptions,
      encoding: 'utf8',
    } as unknown as Parameters<typeof fs.promises.readFile>[1] & {
      encoding: string
    })
  } catch (e) {
    if (shouldThrow) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        throw new ErrorCtor(
          `JSON file not found: ${filepath}\n` +
            'Ensure the file exists or create it with the expected structure.',
          { cause: e },
        )
      }
      // EPERM operand fires on Windows; the if-truthy + EACCES-vs-
      // EPERM operand sub-arms vary per platform.
      /* c8 ignore start - EACCES/EPERM branch is platform-dependent */
      if (code === 'EACCES' || code === 'EPERM') {
        throw new ErrorCtor(
          `Permission denied reading JSON file: ${filepath}\n` +
            'Check file permissions or run with appropriate access.',
          { cause: e },
        )
      }
      /* c8 ignore stop */
      throw e
    }
    return undefined
  }
  const parsed = parseJson(content, {
    filepath: pathStr,
    reviver,
    throws: shouldThrow,
  })
  // Cache the successful parse only when a second stat, taken right after
  // the read, matches the PRE-read stat exactly. A match means the file was
  // untouched for the whole read window, so `content` genuinely corresponds
  // to that stat and it is safe to use as the cache's validity key. A
  // mismatch means a writer committed during the read: `content` might be
  // the old bytes, the new bytes, or a torn mix, so there is no stat that
  // safely represents it - skip the cache store and let the next call
  // re-read rather than risk pinning stale content under a fresh mtime.
  if (cacheEnabled && parsed !== undefined && preReadStat !== undefined) {
    try {
      // Need ino+size+mtime as the cache invalidation key, not existence.
      // oxlint-disable-next-line socket/prefer-exists-sync -- cache key
      const statAfter = await fs.promises.stat(filepath)
      if (
        NumberCtor(statAfter.ino) === NumberCtor(preReadStat.ino) &&
        NumberCtor(statAfter.size) === NumberCtor(preReadStat.size) &&
        NumberCtor(statAfter.mtimeMs) === NumberCtor(preReadStat.mtimeMs)
      ) {
        setCachedJson(
          pathStr,
          NumberCtor(preReadStat.ino),
          NumberCtor(preReadStat.size),
          NumberCtor(preReadStat.mtimeMs),
          parsed,
        )
      }
    } catch {
      // Stat-after-read failed - skip the cache store rather than poison
      // it with no validity key. The read result is still returned.
    }
  }
  return parsed
}

/**
 * Read and parse a JSON file synchronously. Reads the file as UTF-8 text and
 * parses it as JSON. Optionally accepts a reviver function to transform parsed
 * values.
 *
 * @example
 *   ;```ts
 *   // Read and parse tsconfig.json
 *   const tsconfig = readJsonSync('./tsconfig.json')
 *
 *   // Read JSON with custom reviver
 *   const data = readJsonSync('./data.json', {
 *     reviver: (key, value) => {
 *       if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
 *         return new Date(value)
 *       }
 *       return value
 *     },
 *   })
 *
 *   // Don't throw on parse errors
 *   const config = readJsonSync('./config.json', { throws: false })
 *   ```
 *
 * @param filepath - Path to JSON file.
 * @param options - Read and parse options.
 *
 * @returns Parsed JSON value, or undefined if throws is false and an error
 *   occurs.
 */
export function readJsonSync(
  filepath: PathLike,
  options?: ReadJsonOptions | string | undefined,
) {
  const opts = typeof options === 'string' ? { encoding: options } : options
  const { cache, reviver, throws, ...fsOptions } = {
    __proto__: null,
    ...opts,
  } as unknown as ReadJsonOptions
  const shouldThrow = throws === undefined || !!throws
  const cacheEnabled = cache !== false && reviver === undefined
  const fs = getNodeFs()
  const pathStr = String(filepath)
  // Keep the PRE-read stat around: it is the only trustworthy validity key
  // for whatever gets read below. See readJson for the race a post-read-only
  // stat would miss.
  let preReadStat: ReturnType<typeof fs.statSync> | undefined
  if (cacheEnabled) {
    try {
      // Need ino+size+mtime as the cache invalidation key, not existence.
      // oxlint-disable-next-line socket/prefer-exists-sync -- cache key
      const stat = fs.statSync(filepath)
      preReadStat = stat
      const cached = getCachedJson(
        pathStr,
        NumberCtor(stat.ino),
        NumberCtor(stat.size),
        NumberCtor(stat.mtimeMs),
      )
      if (cached !== undefined) {
        return cached
      }
    } catch {
      // Fall through to the read path so error messages stay consistent.
    }
  }
  let content = ''
  try {
    content = fs.readFileSync(filepath, {
      __proto__: null,
      ...fsOptions,
      encoding: 'utf8',
    } as unknown as Parameters<typeof fs.readFileSync>[1] & {
      encoding: string
    })
  } catch (e) {
    if (shouldThrow) {
      const code = (e as NodeJS.ErrnoException).code
      if (code === 'ENOENT') {
        throw new ErrorCtor(
          `JSON file not found: ${filepath}\n` +
            'Ensure the file exists or create it with the expected structure.',
          { cause: e },
        )
      }
      // EPERM operand fires on Windows; the if-truthy + EACCES-vs-
      // EPERM operand sub-arms vary per platform.
      /* c8 ignore start - EACCES/EPERM branch is platform-dependent */
      if (code === 'EACCES' || code === 'EPERM') {
        throw new ErrorCtor(
          `Permission denied reading JSON file: ${filepath}\n` +
            'Check file permissions or run with appropriate access.',
          { cause: e },
        )
      }
      /* c8 ignore stop */
      throw e
    }
    return undefined
  }
  const parsed = parseJson(content, {
    filepath: pathStr,
    reviver,
    throws: shouldThrow,
  })
  // Cache only when a second stat, taken right after the read, matches the
  // PRE-read stat exactly - see readJson for why a mismatch must skip the
  // cache store rather than pin possibly-stale content under a fresh mtime.
  if (cacheEnabled && parsed !== undefined && preReadStat !== undefined) {
    try {
      // Need ino+size+mtime as the cache invalidation key, not existence.
      // oxlint-disable-next-line socket/prefer-exists-sync -- cache key
      const statAfter = fs.statSync(filepath)
      if (
        NumberCtor(statAfter.ino) === NumberCtor(preReadStat.ino) &&
        NumberCtor(statAfter.size) === NumberCtor(preReadStat.size) &&
        NumberCtor(statAfter.mtimeMs) === NumberCtor(preReadStat.mtimeMs)
      ) {
        setCachedJson(
          pathStr,
          NumberCtor(preReadStat.ino),
          NumberCtor(preReadStat.size),
          NumberCtor(preReadStat.mtimeMs),
          parsed,
        )
      }
    } catch {
      // Skip caching when stat-after-read fails - the read result still
      // returns to the caller.
    }
  }
  return parsed
}
