/**
 * @file Public type surface for `fs/*` modules — option shapes, encoding union,
 *   and result records. Pure types only; no runtime side effects so this module
 *   stays cheap to import everywhere.
 */

import type { Abortable } from 'node:events'
import type { ObjectEncodingOptions, OpenMode } from 'node:fs'

import type { JsonReviver } from '../json/types'
import type { Remap } from '../objects/types'

/**
 * Supported text encodings for Node.js Buffers. Includes ASCII, UTF-8/16,
 * base64, binary, and hexadecimal encodings.
 */
export type BufferEncoding =
  | 'ascii'
  | 'utf8'
  | 'utf-8'
  | 'utf16le'
  | 'ucs2'
  | 'ucs-2'
  | 'base64'
  | 'base64url'
  | 'latin1'
  | 'binary'
  | 'hex'

/**
 * Options for asynchronous `findUp` operations.
 */
export interface FindUpOptions {
  /**
   * Starting directory for the search.
   *
   * @default process.cwd()
   */
  cwd?: string | undefined
  /**
   * Only match directories, not files.
   *
   * @default false
   */
  onlyDirectories?: boolean | undefined
  /**
   * Only match files, not directories.
   *
   * @default true
   */
  onlyFiles?: boolean | undefined
  /**
   * Abort signal to cancel the search operation.
   */
  signal?: AbortSignal | undefined
}

/**
 * Options for synchronous `findUpSync` operations.
 */
export interface FindUpSyncOptions {
  /**
   * Starting directory for the search.
   *
   * @default process.cwd()
   */
  cwd?: string | undefined
  /**
   * Directory to stop searching at (inclusive). When provided, search will stop
   * at this directory even if the root hasn't been reached.
   */
  stopAt?: string | undefined
  /**
   * Only match directories, not files.
   *
   * @default false
   */
  onlyDirectories?: boolean | undefined
  /**
   * Only match files, not directories.
   *
   * @default true
   */
  onlyFiles?: boolean | undefined
}

/**
 * Options for checking if a directory is empty.
 */
export interface IsDirEmptyOptions {
  /**
   * Glob patterns for files to ignore when checking emptiness. Files matching
   * these patterns are not counted.
   *
   * @default defaultIgnore
   */
  ignore?: string[] | readonly string[] | undefined
}

/**
 * Represents any valid JSON content type.
 */
export type JsonContent = unknown

/**
 * Options for reading directories with filtering and sorting.
 */
export interface ReadDirOptions {
  /**
   * Glob patterns for directories to ignore.
   *
   * @default undefined
   */
  ignore?: string[] | readonly string[] | undefined
  /**
   * Include empty directories in results. When `false`, empty directories are
   * filtered out.
   *
   * @default true
   */
  includeEmpty?: boolean | undefined
  /**
   * Sort directory names alphabetically using natural sort order.
   *
   * @default true
   */
  sort?: boolean | undefined
}

/**
 * Options for reading files with encoding and abort support. Can be either an
 * options object, an encoding string, or null.
 */
export type ReadFileOptions =
  | Remap<
      ObjectEncodingOptions &
        Abortable & {
          flag?: OpenMode | undefined
        }
    >
  | BufferEncoding
  | null

/**
 * Options for reading and parsing JSON files.
 */
export type ReadJsonOptions = Remap<
  ReadFileOptions & {
    /**
     * Whether to throw errors on parse failure. When `false`, returns
     * `undefined` on error instead of throwing.
     *
     * @default true
     */
    throws?: boolean | undefined
    /**
     * JSON reviver function to transform parsed values. Same as the second
     * parameter to `JSON.parse()`.
     */
    reviver?: Parameters<typeof JSON.parse>[1] | undefined
  }
>

/**
 * Options for read operations with abort support.
 */
export interface ReadOptions extends Abortable {
  /**
   * Character encoding to use for reading.
   *
   * @default 'utf8'
   */
  encoding?: BufferEncoding | string | undefined
  /**
   * File system flag for reading behavior.
   *
   * @default 'r'
   */
  flag?: string | undefined
}

/**
 * Options for file/directory removal operations.
 */
export interface RemoveOptions {
  /**
   * Force deletion even outside normally safe directories. When `false`,
   * prevents deletion outside temp, cacache, and ~/.socket.
   *
   * @default true for safe directories, false otherwise
   */
  force?: boolean | undefined
  /**
   * Maximum number of retry attempts on failure.
   *
   * @default 3
   */
  maxRetries?: number | undefined
  /**
   * Recursively delete directories and contents.
   *
   * @default true
   */
  recursive?: boolean | undefined
  /**
   * Delay in milliseconds between retry attempts.
   *
   * @default 200
   */
  retryDelay?: number | undefined
  /**
   * Abort signal to cancel the operation.
   */
  signal?: AbortSignal | undefined
}

/**
 * Options for safe read operations that don't throw on errors.
 */
export interface SafeReadOptions extends ReadOptions {
  /**
   * Default value to return on read failure. If not provided, `undefined` is
   * returned on error.
   */
  defaultValue?: unknown | undefined
}

/**
 * Result of file readability validation. Contains lists of valid and invalid
 * file paths.
 */
export interface ValidateFilesResult {
  /**
   * File paths that passed validation and are readable.
   */
  validPaths: string[]
  /**
   * File paths that failed validation (unreadable, permission denied, or
   * non-existent). Common with Yarn Berry PnP virtual filesystem, pnpm
   * symlinks, or filesystem race conditions.
   */
  invalidPaths: string[]
}

/**
 * Options for writing JSON files with formatting control.
 */
export interface WriteJsonOptions extends WriteOptions {
  /**
   * End-of-line sequence to use.
   *
   * @example
   *   ;```ts
   *   // Windows-style line endings
   *   writeJson('data.json', data, { EOL: '\r\n' })
   *   ```
   *
   * @default '\n'
   */
  EOL?: string | undefined
  /**
   * Whether to add a final newline at end of file.
   *
   * @default true
   */
  finalEOL?: boolean | undefined
  /**
   * JSON replacer function to transform values during stringification. Same as
   * the second parameter to `JSON.stringify()`.
   */
  replacer?: JsonReviver | undefined
  /**
   * Number of spaces for indentation, or string to use for indentation.
   *
   * @example
   *   ;```ts
   *   // Use tabs instead of spaces
   *   writeJson('data.json', data, { spaces: '\t' })
   *
   *   // Use 4 spaces for indentation
   *   writeJson('data.json', data, { spaces: 4 })
   *   ```
   *
   * @default 2
   */
  spaces?: number | string | undefined
}

/**
 * Options for write operations with encoding and mode control.
 */
export interface WriteOptions extends Abortable {
  /**
   * Character encoding for writing.
   *
   * @default 'utf8'
   */
  encoding?: BufferEncoding | string | undefined
  /**
   * File mode (permissions) to set. Uses standard Unix permission bits (e.g.,
   * 0o644).
   *
   * @default 0o666 (read/write for all, respecting umask)
   */
  mode?: number | undefined
  /**
   * File system flag for write behavior.
   *
   * @default 'w' (create or truncate)
   */
  flag?: string | undefined
}
