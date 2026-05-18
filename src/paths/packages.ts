/**
 * @file Package.json path resolution utilities.
 */

import { normalizePath } from './normalize'

import { StringPrototypeEndsWith } from '../primordials/string'

import { getNodePath } from '../node/path'

/**
 * Whether `filepath`'s final segment is exactly `package.json`. Accepts both
 * POSIX and Windows-style separators so paths captured on either platform
 * classify the same regardless of the host we're running on.
 */
/*@__NO_SIDE_EFFECTS__*/
export function isPackageJsonFile(filepath: string): boolean {
  return (
    filepath === 'package.json' ||
    StringPrototypeEndsWith(filepath, '/package.json') ||
    StringPrototypeEndsWith(filepath, '\\package.json')
  )
}

/**
 * Resolve directory path from a package.json file path.
 */
/*@__NO_SIDE_EFFECTS__*/
export function resolvePackageJsonDirname(filepath: string): string {
  if (isPackageJsonFile(filepath)) {
    const path = getNodePath()
    return normalizePath(path.dirname(filepath))
  }
  return normalizePath(filepath)
}

/**
 * Resolve full path to package.json from a directory or file path.
 */
/*@__NO_SIDE_EFFECTS__*/
export function resolvePackageJsonPath(filepath: string): string {
  if (isPackageJsonFile(filepath)) {
    return normalizePath(filepath)
  }
  const path = getNodePath()
  return normalizePath(path.join(filepath, 'package.json'))
}
