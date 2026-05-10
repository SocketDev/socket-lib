/**
 * @fileoverview Read-and-parse helpers for JSON files. Wraps fs reads
 * in actionable error messages keyed off `ENOENT` / `EACCES` / `EPERM`
 * so callers see "JSON file not found" / "Permission denied" rather
 * than the bare errno. Both variants honor `throws: false` to fall
 * back to `undefined` on parse or read failure.
 */

import { jsonParse } from '../json/parse'
import { getNodeFs } from '../node/fs'
import { ErrorCtor } from '../primordials'

import type { PathLike } from 'node:fs'

import type { ReadJsonOptions } from './types'

/**
 * Read and parse a JSON file asynchronously.
 * Reads the file as UTF-8 text and parses it as JSON.
 * Optionally accepts a reviver function to transform parsed values.
 *
 * @param filepath - Path to JSON file
 * @param options - Read and parse options
 * @returns Promise resolving to parsed JSON value, or undefined if throws is false and an error occurs
 *
 * @example
 * ```ts
 * // Read and parse package.json
 * const pkg = await readJson('./package.json')
 *
 * // Read JSON with custom reviver
 * const data = await readJson('./data.json', {
 *   reviver: (key, value) => {
 *     if (key === 'date') return new Date(value)
 *     return value
 *   }
 * })
 *
 * // Don't throw on parse errors
 * const config = await readJson('./config.json', { throws: false })
 * if (config === undefined) {
 *   console.log('Failed to parse config')
 * }
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export async function readJson(
  filepath: PathLike,
  options?: ReadJsonOptions | string | undefined,
) {
  const opts = typeof options === 'string' ? { encoding: options } : options
  const { reviver, throws, ...fsOptions } = {
    __proto__: null,
    ...opts,
  } as unknown as ReadJsonOptions
  const shouldThrow = throws === undefined || !!throws
  const fs = getNodeFs()
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
  return jsonParse(content, {
    filepath: String(filepath),
    reviver,
    throws: shouldThrow,
  })
}

/**
 * Read and parse a JSON file synchronously.
 * Reads the file as UTF-8 text and parses it as JSON.
 * Optionally accepts a reviver function to transform parsed values.
 *
 * @param filepath - Path to JSON file
 * @param options - Read and parse options
 * @returns Parsed JSON value, or undefined if throws is false and an error occurs
 *
 * @example
 * ```ts
 * // Read and parse tsconfig.json
 * const tsconfig = readJsonSync('./tsconfig.json')
 *
 * // Read JSON with custom reviver
 * const data = readJsonSync('./data.json', {
 *   reviver: (key, value) => {
 *     if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}/.test(value)) {
 *       return new Date(value)
 *     }
 *     return value
 *   }
 * })
 *
 * // Don't throw on parse errors
 * const config = readJsonSync('./config.json', { throws: false })
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function readJsonSync(
  filepath: PathLike,
  options?: ReadJsonOptions | string | undefined,
) {
  const opts = typeof options === 'string' ? { encoding: options } : options
  const { reviver, throws, ...fsOptions } = {
    __proto__: null,
    ...opts,
  } as unknown as ReadJsonOptions
  const shouldThrow = throws === undefined || !!throws
  const fs = getNodeFs()
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
  return jsonParse(content, {
    filepath: String(filepath),
    reviver,
    throws: shouldThrow,
  })
}
