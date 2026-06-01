/**
 * @file File-content readers — UTF-8 / binary / safe variants (sync + async).
 *   The `safe*` versions trap errors and return `undefined` (or a
 *   caller-supplied `defaultValue`) so they fit the non-throwing-fallback shape
 *   used elsewhere in the lib. The encoding `null` overload returns a `Buffer`;
 *   the default and any string encoding return a string. The runtime fast-path
 *   normalizes encoding once and forwards untouched options to `node:fs`.
 */

import { getAbortSignal } from '../process/abort'
import { getNodeFs } from '../node/fs'
import { BufferIsBuffer } from '../primordials/buffer'
import { normalizeEncoding } from './encoding'

import type { Abortable } from 'node:events'
import type { ObjectEncodingOptions, PathLike } from 'node:fs'

import type { ReadFileOptions, ReadOptions, SafeReadOptions } from './types'

const abortSignal = getAbortSignal()

/**
 * Read a file as binary data asynchronously. Returns a Buffer without encoding
 * the contents. Useful for reading images, archives, or other binary formats.
 *
 * @example
 *   ;```ts
 *   // Read an image file
 *   const imageBuffer = await readFileBinary('./image.png')
 *
 *   // Read with abort signal
 *   const buffer = await readFileBinary('./data.bin', { signal: abortSignal })
 *   ```
 *
 * @param filepath - Path to file.
 * @param options - Read options (encoding is forced to null for binary)
 *
 * @returns Promise resolving to Buffer containing file contents
 */
export async function readFileBinary(
  filepath: PathLike,
  options?: ReadFileOptions | undefined,
) {
  // Don't specify encoding to get a Buffer.
  const opts = typeof options === 'string' ? { encoding: options } : options
  const fs = getNodeFs()
  return await fs.promises.readFile(filepath, {
    signal: abortSignal,
    ...opts,
    encoding: undefined,
  })
}

/**
 * Read a file as binary data synchronously. Returns a Buffer without encoding
 * the contents. Useful for reading images, archives, or other binary formats.
 *
 * @example
 *   ;```ts
 *   // Read an image file
 *   const imageBuffer = readFileBinarySync('./logo.png')
 *
 *   // Read a compressed file
 *   const gzipData = readFileBinarySync('./archive.gz')
 *   ```
 *
 * @param filepath - Path to file.
 * @param options - Read options (encoding is forced to null for binary)
 *
 * @returns Buffer containing file contents
 */
export function readFileBinarySync(
  filepath: PathLike,
  options?: ReadFileOptions | undefined,
) {
  // Don't specify encoding to get a Buffer
  const opts = typeof options === 'string' ? { encoding: options } : options
  const fs = getNodeFs()
  return fs.readFileSync(filepath, {
    ...opts,
    encoding: undefined,
  } as ObjectEncodingOptions)
}

/**
 * Read a file as UTF-8 text asynchronously. Returns a string with the file
 * contents decoded as UTF-8. This is the most common way to read text files.
 *
 * @example
 *   ;```ts
 *   // Read a text file
 *   const content = await readFileUtf8('./README.md')
 *
 *   // Read with custom encoding
 *   const content = await readFileUtf8('./data.txt', { encoding: 'utf-8' })
 *   ```
 *
 * @param filepath - Path to file.
 * @param options - Read options including encoding and abort signal.
 *
 * @returns Promise resolving to string containing file contents
 */
export async function readFileUtf8(
  filepath: PathLike,
  options?: ReadFileOptions | undefined,
) {
  const opts = typeof options === 'string' ? { encoding: options } : options
  const fs = getNodeFs()
  return await fs.promises.readFile(filepath, {
    signal: abortSignal,
    ...opts,
    encoding: 'utf8',
  })
}

/**
 * Read a file as UTF-8 text synchronously. Returns a string with the file
 * contents decoded as UTF-8. This is the most common way to read text files
 * synchronously.
 *
 * @example
 *   ;```ts
 *   // Read a configuration file
 *   const config = readFileUtf8Sync('./config.txt')
 *
 *   // Read with custom options
 *   const data = readFileUtf8Sync('./data.txt', { encoding: 'utf8' })
 *   ```
 *
 * @param filepath - Path to file.
 * @param options - Read options including encoding.
 *
 * @returns String containing file contents
 */
export function readFileUtf8Sync(
  filepath: PathLike,
  options?: ReadFileOptions | undefined,
) {
  const opts = typeof options === 'string' ? { encoding: options } : options
  const fs = getNodeFs()
  return fs.readFileSync(filepath, {
    ...opts,
    encoding: 'utf8',
  } as ObjectEncodingOptions)
}

/**
 * Safely read a file asynchronously, returning undefined on error. Useful when
 * you want to attempt reading a file without handling errors explicitly.
 * Returns undefined for any error (file not found, permission denied, etc.).
 * Defaults to UTF-8 encoding, returning a string unless encoding is explicitly
 * set to null.
 *
 * @example
 *   ;```ts
 *   // Try to read a file as UTF-8 string (default), get undefined if it doesn't exist
 *   const content = await safeReadFile('./optional-config.txt')
 *   if (content) {
 *     console.log('Config found:', content)
 *   }
 *
 *   // Read with specific encoding
 *   const data = await safeReadFile('./data.txt', { encoding: 'utf8' })
 *
 *   // Read as Buffer by setting encoding to null
 *   const buffer = await safeReadFile('./binary.dat', { encoding: null })
 *   ```
 *
 * @param filepath - Path to file.
 * @param options - Read options including encoding and default value.
 *
 * @returns Promise resolving to file contents (string by default), or undefined
 *   on error.
 */
export async function safeReadFile(
  filepath: PathLike,
  options: SafeReadOptions & { encoding: null },
): Promise<Buffer | undefined>
export async function safeReadFile(
  filepath: PathLike,
  options?: SafeReadOptions | undefined,
): Promise<string | undefined>
export async function safeReadFile(
  filepath: PathLike,
  options?: SafeReadOptions | undefined,
): Promise<string | Buffer | undefined> {
  // string-options vs options-object ternary; both arms tested but
  // the string-shortcut form is less common in test paths.
  /* c8 ignore next 4 */
  const opts =
    typeof options === 'string'
      ? { __proto__: null, encoding: options }
      : ({ __proto__: null, ...options } as SafeReadOptions)
  const { defaultValue, ...rawReadOpts } = opts as SafeReadOptions
  const readOpts = { __proto__: null, ...rawReadOpts } as ReadOptions
  const shouldReturnBuffer = readOpts.encoding === null
  // null-encoding arm fires only when caller passes encoding: null.
  /* c8 ignore next 3 */
  const encoding = shouldReturnBuffer
    ? undefined
    : normalizeEncoding(readOpts.encoding)
  const fs = getNodeFs()
  try {
    return await fs.promises.readFile(filepath, {
      __proto__: null,
      signal: abortSignal,
      ...readOpts,
      encoding,
    } as Abortable)
  } catch {}
  if (defaultValue === undefined) {
    return undefined
  }
  if (shouldReturnBuffer) {
    return BufferIsBuffer!(defaultValue) ? defaultValue : undefined
  }
  return typeof defaultValue === 'string' ? defaultValue : String(defaultValue)
}

/**
 * Safely read a file synchronously, returning undefined on error. Useful when
 * you want to attempt reading a file without handling errors explicitly.
 * Returns undefined for any error (file not found, permission denied, etc.).
 * Defaults to UTF-8 encoding, returning a string unless encoding is explicitly
 * set to null.
 *
 * @example
 *   ;```ts
 *   // Try to read a config file as UTF-8 string (default)
 *   const config = safeReadFileSync('./config.txt')
 *   if (config) {
 *     console.log('Config loaded successfully')
 *   }
 *
 *   // Read with explicit encoding
 *   const data = safeReadFileSync('./data.txt', { encoding: 'utf8' })
 *
 *   // Read binary file by setting encoding to null
 *   const buffer = safeReadFileSync('./image.png', { encoding: null })
 *   ```
 *
 * @param filepath - Path to file.
 * @param options - Read options including encoding and default value.
 *
 * @returns File contents (string by default), or undefined on error
 */
export function safeReadFileSync(
  filepath: PathLike,
  options: SafeReadOptions & { encoding: null },
): Buffer | undefined
export function safeReadFileSync(
  filepath: PathLike,
  options?: SafeReadOptions | undefined,
): string | undefined
export function safeReadFileSync(
  filepath: PathLike,
  options?: SafeReadOptions | undefined,
): string | Buffer | undefined {
  // string-options vs options-object ternary; both arms tested but
  // the string-shortcut form is less common in test paths.
  /* c8 ignore next 4 */
  const opts =
    typeof options === 'string'
      ? { __proto__: null, encoding: options }
      : ({ __proto__: null, ...options } as SafeReadOptions)
  const { defaultValue, ...rawReadOpts } = opts as SafeReadOptions
  const readOpts = { __proto__: null, ...rawReadOpts } as ReadOptions
  const shouldReturnBuffer = readOpts.encoding === null
  // null-encoding arm fires only when caller passes encoding: null.
  /* c8 ignore next 3 */
  const encoding = shouldReturnBuffer
    ? undefined
    : normalizeEncoding(readOpts.encoding)
  const fs = getNodeFs()
  try {
    return fs.readFileSync(filepath, {
      __proto__: null,
      ...readOpts,
      encoding,
    } as ObjectEncodingOptions)
  } catch {}
  if (defaultValue === undefined) {
    return undefined
  }
  if (shouldReturnBuffer) {
    return BufferIsBuffer!(defaultValue) ? defaultValue : undefined
  }
  return typeof defaultValue === 'string' ? defaultValue : String(defaultValue)
}
