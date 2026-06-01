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
} from './read-json-cache'
import { parseJson } from '../json/parse'

export {
  clearReadJsonCache,
  getReadJsonCacheStats,
  setReadJsonCacheMax,
  setReadJsonCacheTtlMs,
}
import { getNodeFs } from '../node/fs'
import { ErrorCtor } from '../primordials/error'
import { NumberCtor } from '../primordials/number'
import type { PathLike } from 'node:fs'

import type { ReadJsonOptions } from './types'

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
  // default-on caching safe under caller mutation.
  if (cacheEnabled) {
    try {
      // oxlint-disable-next-line socket/prefer-exists-sync -- need ino+size+mtime as the cache invalidation key, not just existence.
      const stat = await fs.promises.stat(filepath)
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
      // Stat failed (ENOENT etc.) — fall through to the read path so the
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
      /* c8 ignore start */
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
  // Cache the successful parse. Run a fresh stat AFTER the read so the
  // cached key reflects the actual on-disk state at parse time. A concurrent
  // writer between read and stat would write a slightly-stale entry, which
  // self-heals on the very next call (the next stat differs from the
  // entry's mtime → miss → re-read).
  if (cacheEnabled && parsed !== undefined) {
    try {
      // oxlint-disable-next-line socket/prefer-exists-sync -- need ino+size+mtime as the cache invalidation key, not just existence.
      const stat = await fs.promises.stat(filepath)
      setCachedJson(
        pathStr,
        NumberCtor(stat.ino),
        NumberCtor(stat.size),
        NumberCtor(stat.mtimeMs),
        parsed,
      )
    } catch {
      // Stat-after-read failed — skip the cache store rather than poison
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
  if (cacheEnabled) {
    try {
      // oxlint-disable-next-line socket/prefer-exists-sync -- need ino+size+mtime as the cache invalidation key, not just existence.
      const stat = fs.statSync(filepath)
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
      /* c8 ignore start */
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
  if (cacheEnabled && parsed !== undefined) {
    try {
      // oxlint-disable-next-line socket/prefer-exists-sync -- need ino+size+mtime as the cache invalidation key, not just existence.
      const stat = fs.statSync(filepath)
      setCachedJson(
        pathStr,
        NumberCtor(stat.ino),
        NumberCtor(stat.size),
        NumberCtor(stat.mtimeMs),
        parsed,
      )
    } catch {
      // Skip caching when stat-after-read fails — the read result still
      // returns to the caller.
    }
  }
  return parsed
}
