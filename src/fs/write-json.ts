/**
 * @fileoverview JSON writers that match the wire-format conventions a
 * tool ecosystem expects: configurable indentation, configurable EOL,
 * trailing newline by default. The `stringify` helper is exported so
 * callers that already have an `fs` handle can render a buffer without
 * round-tripping through this module's writers.
 */

import { getNodeFs } from '../node/fs'
import { JSONStringify } from '../primordials/json'
import { StringPrototypeReplace } from '../primordials/string'
import type { ObjectEncodingOptions, PathLike, WriteFileOptions } from 'node:fs'

import type { JsonReviver } from '../json/types'
import type { WriteJsonOptions } from './types'

// Module-level regex constant — avoid re-allocating on every call.
const NEWLINE_REGEX = /\n/g

/**
 * Stringify JSON with custom formatting options.
 * Formats JSON with configurable line endings and indentation.
 *
 * @param json - Value to stringify
 * @param EOL - End-of-line sequence
 * @param finalEOL - Whether to add final newline
 * @param replacer - JSON replacer function
 * @param spaces - Indentation spaces or string
 * @returns Formatted JSON string
 */
/*@__NO_SIDE_EFFECTS__*/
export function stringify(
  json: unknown,
  EOL: string,
  finalEOL: boolean,
  replacer: JsonReviver | undefined,
  spaces: number | string = 2,
): string {
  const EOF = finalEOL ? EOL : ''
  const str = JSONStringify(json, replacer, spaces)
  return `${StringPrototypeReplace(str, NEWLINE_REGEX, EOL)}${EOF}`
}

/**
 * Write JSON content to a file asynchronously with formatting.
 * Stringifies the value with configurable indentation and line endings.
 * Automatically adds a final newline by default for POSIX compliance.
 *
 * @param filepath - Path to write to
 * @param jsonContent - Value to stringify and write
 * @param options - Write options including formatting and encoding
 * @returns Promise that resolves when write completes
 *
 * @example
 * ```ts
 * // Write formatted JSON with default 2-space indentation
 * await writeJson('./data.json', { name: 'example', version: '1.0.0' })
 *
 * // Write with custom indentation
 * await writeJson('./config.json', config, { spaces: 4 })
 *
 * // Write with tabs instead of spaces
 * await writeJson('./data.json', data, { spaces: '\t' })
 *
 * // Write without final newline
 * await writeJson('./inline.json', obj, { finalEOL: false })
 *
 * // Write with Windows line endings
 * await writeJson('./win.json', data, { EOL: '\r\n' })
 * ```
 */
export async function writeJson(
  filepath: PathLike,
  jsonContent: unknown,
  options?: WriteJsonOptions | string,
): Promise<void> {
  const opts = typeof options === 'string' ? { encoding: options } : options
  const { EOL, finalEOL, replacer, spaces, ...fsOptions } = {
    __proto__: null,
    ...opts,
  } as WriteJsonOptions
  const fs = getNodeFs()
  const jsonString = stringify(
    jsonContent,
    EOL || '\n',
    finalEOL !== undefined ? finalEOL : true,
    replacer,
    spaces,
  )
  await fs.promises.writeFile(filepath, jsonString, {
    encoding: 'utf8',
    ...fsOptions,
    __proto__: null,
  } as ObjectEncodingOptions)
}

/**
 * Write JSON content to a file synchronously with formatting.
 * Stringifies the value with configurable indentation and line endings.
 * Automatically adds a final newline by default for POSIX compliance.
 *
 * @param filepath - Path to write to
 * @param jsonContent - Value to stringify and write
 * @param options - Write options including formatting and encoding
 *
 * @example
 * ```ts
 * // Write formatted JSON with default 2-space indentation
 * writeJsonSync('./package.json', pkg)
 *
 * // Write with custom indentation
 * writeJsonSync('./tsconfig.json', tsconfig, { spaces: 4 })
 *
 * // Write with tabs for indentation
 * writeJsonSync('./data.json', data, { spaces: '\t' })
 *
 * // Write compacted (no indentation)
 * writeJsonSync('./compact.json', data, { spaces: 0 })
 * ```
 */
export function writeJsonSync(
  filepath: PathLike,
  jsonContent: unknown,
  options?: WriteJsonOptions | string | undefined,
): void {
  const opts = typeof options === 'string' ? { encoding: options } : options
  const { EOL, finalEOL, replacer, spaces, ...fsOptions } = {
    __proto__: null,
    ...opts,
  }
  const fs = getNodeFs()
  const jsonString = stringify(
    jsonContent,
    EOL || '\n',
    finalEOL !== undefined ? finalEOL : true,
    replacer,
    spaces,
  )
  fs.writeFileSync(filepath, jsonString, {
    encoding: 'utf8',
    ...fsOptions,
    __proto__: null,
  } as WriteFileOptions)
}
