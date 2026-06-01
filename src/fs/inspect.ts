/**
 * @file Filesystem inspection helpers — `stat` / `lstat` wrappers that return
 *   `undefined` instead of throwing, and the directory / symlink / emptiness
 *   predicates layered on top. Every entry point catches errors and reduces
 *   them to a falsy result; callers that need the underlying error code should
 *   use `node:fs` directly.
 */

/* oxlint-disable socket/prefer-exists-sync -- this module IS the stat-wrapper surface; callers use these for type discrimination (isFile/isDirectory) or metadata, not pure existence checks. */

import { defaultIgnore } from '../globs/defaults'
import { getGlobMatcher } from '../globs/matcher'
import { getNodeFs } from '../node/fs'
import { pathLikeToString } from '../paths/normalize'

import type { PathLike, StatSyncOptions } from 'node:fs'

import type { IsDirEmptyOptions } from './types'

/**
 * Check if a path is a directory asynchronously. Returns `true` for
 * directories, `false` for files or non-existent paths.
 *
 * @example
 *   ;```ts
 *   if (await isDir('./src')) {
 *     console.log('src is a directory')
 *   }
 *   ```
 *
 * @param filepath - Path to check.
 *
 * @returns `true` if path is a directory, `false` otherwise
 */
/*@__NO_SIDE_EFFECTS__*/
export async function isDir(filepath: PathLike) {
  return !!(await safeStat(filepath))?.isDirectory()
}

/**
 * Check if a directory is empty synchronously. A directory is considered empty
 * if it contains no files after applying ignore patterns. Uses glob patterns to
 * filter ignored files.
 *
 * @example
 *   ;```ts
 *   // Check if directory is completely empty
 *   isDirEmptySync('./build')
 *
 *   // Check if directory is empty, ignoring .DS_Store files
 *   isDirEmptySync('./cache', { ignore: ['.DS_Store'] })
 *   ```
 *
 * @param dirname - Directory path to check.
 * @param options - Options including ignore patterns.
 *
 * @returns `true` if directory is empty (or doesn't exist), `false` otherwise
 */
/*@__NO_SIDE_EFFECTS__*/
export function isDirEmptySync(
  dirname: PathLike,
  options?: IsDirEmptyOptions | undefined,
) {
  const { ignore = defaultIgnore } = {
    __proto__: null,
    ...options,
  } as IsDirEmptyOptions
  const fs = getNodeFs()
  try {
    const files = fs.readdirSync(dirname)
    const { length } = files
    if (length === 0) {
      return true
    }
    const matcher = getGlobMatcher(
      ignore as string[],
      {
        cwd: pathLikeToString(dirname),
      } as {
        cwd?: string | undefined
        dot?: boolean | undefined
        ignore?: string[] | undefined
        nocase?: boolean | undefined
      },
    )
    let ignoredCount = 0
    for (let i = 0; i < length; i += 1) {
      const file = files[i]
      if (file && matcher(file)) {
        ignoredCount += 1
      }
    }
    return ignoredCount === length
  } catch {
    // Return false for non-existent paths or other errors.
    return false
  }
}

/**
 * Check if a path is a directory synchronously. Returns `true` for directories,
 * `false` for files or non-existent paths.
 *
 * @example
 *   ;```ts
 *   if (isDirSync('./src')) {
 *     console.log('src is a directory')
 *   }
 *   ```
 *
 * @param filepath - Path to check.
 *
 * @returns `true` if path is a directory, `false` otherwise
 */
/*@__NO_SIDE_EFFECTS__*/
export function isDirSync(filepath: PathLike) {
  return !!safeStatSync(filepath)?.isDirectory()
}

/**
 * Check if a path is a symbolic link synchronously. Uses `lstat` to check the
 * link itself, not the target.
 *
 * @example
 *   ;```ts
 *   if (isSymlinkSync('./my-link')) {
 *     console.log('Path is a symbolic link')
 *   }
 *   ```
 *
 * @param filepath - Path to check.
 *
 * @returns `true` if path is a symbolic link, `false` otherwise
 */
/*@__NO_SIDE_EFFECTS__*/
export function isSymlinkSync(filepath: PathLike) {
  const fs = getNodeFs()
  try {
    return fs.lstatSync(filepath).isSymbolicLink()
  } catch {}
  return false
}

/**
 * Safely get file stats asynchronously, returning undefined on error. Useful
 * for checking file existence and properties without error handling. Returns
 * undefined for any error (file not found, permission denied, etc.).
 *
 * @example
 *   ;```ts
 *   // Check if file exists and get its stats
 *   const stats = await safeStat('./file.txt')
 *   if (stats) {
 *     console.log('File size:', stats.size)
 *     console.log('Modified:', stats.mtime)
 *   }
 *   ```
 *
 * @param filepath - Path to check.
 *
 * @returns Promise resolving to Stats object, or undefined on error
 */
/*@__NO_SIDE_EFFECTS__*/
export async function safeStat(filepath: PathLike) {
  const fs = getNodeFs()
  try {
    return await fs.promises.stat(filepath)
  } catch {}
  return undefined
}

/**
 * Safely get file stats synchronously, returning undefined on error. Useful for
 * checking file existence and properties without error handling. Returns
 * undefined for any error (file not found, permission denied, etc.).
 *
 * @example
 *   ;```ts
 *   // Check if file exists and get its size
 *   const stats = safeStatSync('./file.txt')
 *   if (stats) {
 *     console.log('File size:', stats.size)
 *     console.log('Is directory:', stats.isDirectory())
 *   }
 *   ```
 *
 * @param filepath - Path to check.
 *
 * @returns Stats object, or undefined on error
 */
/*@__NO_SIDE_EFFECTS__*/
export function safeStatSync(filepath: PathLike) {
  const fs = getNodeFs()
  try {
    return fs.statSync(filepath, {
      __proto__: null,
      throwIfNoEntry: false,
    } as StatSyncOptions)
  } catch {}
  return undefined
}
