/**
 * @file Async/sync directory listing — returns directory names only (filtering
 *   out files), with optional emptiness suppression and natural-order sorting.
 *   Glob-based ignore patterns are evaluated only when `includeEmpty: false`
 *   triggers a per-entry emptiness probe.
 */

import { getNodeFs } from '../node/fs'
import { getNodePath } from '../node/path'
import { naturalCompare } from '../sorts/natural'

import { isDirEmptySync } from './inspect'

import type { Dirent, ObjectEncodingOptions, PathLike } from 'node:fs'

import type { ReadDirOptions } from './types'

/**
 * Process directory entries and filter for directories. Filters entries to
 * include only directories, optionally excluding empty ones. Applies ignore
 * patterns and natural sorting.
 *
 * @param dirents - Directory entries from readdir.
 * @param dirname - Parent directory path.
 * @param options - Filtering and sorting options.
 *
 * @returns Array of directory names, optionally sorted
 */
/*@__NO_SIDE_EFFECTS__*/
export function innerReadDirNames(
  dirents: Dirent[],
  dirname: string | undefined,
  options?: ReadDirOptions | undefined,
): string[] {
  const {
    ignore,
    includeEmpty = true,
    sort = true,
  } = { __proto__: null, ...options } as ReadDirOptions
  const path = getNodePath()
  const names = dirents
    .filter(
      (d: Dirent) =>
        d.isDirectory() &&
        (includeEmpty ||
          !isDirEmptySync(path.join(dirname || d.parentPath, d.name), {
            ignore,
          })),
    )
    .map((d: Dirent) => d.name)
  return sort ? names.toSorted(naturalCompare) : names
}

/**
 * Read directory names asynchronously with filtering and sorting. Returns only
 * directory names (not files), with optional filtering for empty directories
 * and glob-based ignore patterns. Results are naturally sorted by default.
 *
 * @example
 *   ;```ts
 *   // Get all subdirectories, sorted naturally
 *   const dirs = await readDirNames('./packages')
 *
 *   // Get non-empty directories only
 *   const nonEmpty = await readDirNames('./cache', { includeEmpty: false })
 *
 *   // Get directories without sorting
 *   const unsorted = await readDirNames('./src', { sort: false })
 *   ```
 *
 * @param dirname - Directory path to read.
 * @param options - Options for filtering and sorting.
 *
 * @returns Array of directory names, empty array on error
 */
/*@__NO_SIDE_EFFECTS__*/
export async function readDirNames(
  dirname: PathLike,
  options?: ReadDirOptions | undefined,
) {
  const fs = getNodeFs()
  try {
    return innerReadDirNames(
      await fs.promises.readdir(dirname, {
        __proto__: null,
        encoding: 'utf8',
        withFileTypes: true,
      } as ObjectEncodingOptions & { withFileTypes: true }),
      String(dirname),
      options,
    )
  } catch {}
  return []
}

/**
 * Read directory names synchronously with filtering and sorting. Returns only
 * directory names (not files), with optional filtering for empty directories
 * and glob-based ignore patterns. Results are naturally sorted by default.
 *
 * @example
 *   ;```ts
 *   // Get all subdirectories, sorted naturally
 *   const dirs = readDirNamesSync('./packages')
 *
 *   // Get non-empty directories only, ignoring node_modules
 *   const nonEmpty = readDirNamesSync('./src', {
 *     includeEmpty: false,
 *     ignore: ['node_modules'],
 *   })
 *   ```
 *
 * @param dirname - Directory path to read.
 * @param options - Options for filtering and sorting.
 *
 * @returns Array of directory names, empty array on error
 */
/*@__NO_SIDE_EFFECTS__*/
export function readDirNamesSync(dirname: PathLike, options?: ReadDirOptions) {
  const fs = getNodeFs()
  try {
    return innerReadDirNames(
      fs.readdirSync(dirname, {
        __proto__: null,
        encoding: 'utf8',
        withFileTypes: true,
      } as ObjectEncodingOptions & { withFileTypes: true }),
      String(dirname),
      options,
    )
  } catch {}
  return []
}
