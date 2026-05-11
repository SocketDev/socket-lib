/**
 * @fileoverview Path conversion utilities — MSYS↔native bridging and
 * string-shape helpers. Split out of `paths/normalize.ts` for size
 * hygiene.
 *
 *   - `fromUnixPath` / `toUnixPath` — MSYS↔native conversion
 *   - `splitPath` — segment-array view of a path
 *   - `trimLeadingDotSlash` — strip a single `./` / `.\` prefix
 */

import { WIN32 } from '../constants/platform'

import { StringPrototypeStartsWith } from '../primordials/string'

import { pathLikeToString, slashRegExp } from './_internal'
import { normalizePath } from './normalize'

/**
 * Convert Unix-style POSIX paths to native Windows paths.
 *
 * This is the inverse of {@link toUnixPath}. On Windows, MSYS-style paths
 * use `/c/` notation for drive letters and forward slashes, which PowerShell
 * and cmd.exe cannot resolve. This function converts them to native Windows
 * format with backslashes and proper drive letters.
 *
 * @param {string | Buffer | URL} pathLike - The MSYS/Unix-style path to convert
 * @returns {string} Native Windows path or normalized Unix path
 *
 * @example
 * ```typescript
 * fromUnixPath('/c/projects/app/file.txt')    // 'C:\\projects\\app\\file.txt' on Windows
 * fromUnixPath('/tmp/build/output')           // '/tmp/build/output'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function fromUnixPath(pathLike: string | Buffer | URL): string {
  const normalized = normalizePath(pathLike)
  // Windows-only backslash conversion.
  /* c8 ignore start */
  if (WIN32) {
    return normalized.replace(/\//g, '\\')
  }
  /* c8 ignore stop */
  return normalized
}

/**
 * Split a path into an array of segments.
 *
 * Divides a path into individual components by splitting on path separators
 * (both forward slashes and backslashes).
 *
 * @param {string | Buffer | URL} pathLike - The path to split
 * @returns {string[]} Array of path segments, or empty array for empty paths
 *
 * @example
 * ```typescript
 * splitPath('/home/user/file.txt')      // ['', 'home', 'user', 'file.txt']
 * splitPath('C:\\Users\\John')          // ['C:', 'Users', 'John']
 * splitPath('')                         // []
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function splitPath(pathLike: string | Buffer | URL): string[] {
  const filepath = pathLikeToString(pathLike)
  if (filepath === '') {
    return []
  }
  return filepath.split(slashRegExp)
}

/**
 * Convert Windows paths to MSYS/Unix-style POSIX paths for Git Bash tools.
 *
 * Git for Windows and MSYS2 tools expect POSIX-style paths with forward
 * slashes and Unix drive letter notation (`/c/` instead of `C:\`).
 *
 * This is the inverse of {@link fromUnixPath}.
 *
 * @param {string | Buffer | URL} pathLike - The path to convert
 * @returns {string} Unix-style POSIX path
 *
 * @example
 * ```typescript
 * toUnixPath('C:\\path\\to\\file.txt')     // '/c/path/to/file.txt' on Windows
 * toUnixPath('/home/user/file')            // '/home/user/file'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function toUnixPath(pathLike: string | Buffer | URL): string {
  // Always normalize first to ensure consistent behavior across platforms
  // (empty → '.', backslashes → forward slashes).
  const normalized = normalizePath(pathLike)

  // Windows drive-letter conversion; tested on Windows runners.
  /* c8 ignore start */
  if (WIN32) {
    return normalized.replace(
      /^([A-Z]):/i,
      (_, letter) => `/${letter.toLowerCase()}`,
    )
  }
  /* c8 ignore stop */

  return normalized
}

/**
 * Remove a leading `./` or `.\` prefix from a path.
 *
 * Only removes a single leading `./` or `.\`. Does not touch `../` prefixes.
 *
 * @param {string | Buffer | URL} pathLike - The path to process
 * @returns {string} The path without leading `./` / `.\`, or unchanged
 *
 * @example
 * ```typescript
 * trimLeadingDotSlash('./src/index.js')     // 'src/index.js'
 * trimLeadingDotSlash('../lib/util.js')     // '../lib/util.js'
 * trimLeadingDotSlash('/absolute/path')     // '/absolute/path'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function trimLeadingDotSlash(pathLike: string | Buffer | URL): string {
  const filepath = pathLikeToString(pathLike)
  if (
    StringPrototypeStartsWith(filepath, './') ||
    StringPrototypeStartsWith(filepath, '.\\')
  ) {
    return filepath.slice(2)
  }
  return filepath
}
