/** @fileoverview Path utilities for DLX package installations. */

import { normalizePath } from '../paths/normalize'
import { getSocketDlxDir } from '../paths/socket'

let _path: typeof import('path') | undefined
/**
 * Lazily load the path module to avoid Webpack errors.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getPath() {
  if (_path === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _path = /*@__PURE__*/ require('node:path')
  }
  return _path!
}

/**
 * Get the installed package directory within DLX node_modules.
 */
export function getDlxInstalledPackageDir(packageName: string): string {
  const path = getPath()
  return normalizePath(
    path.join(getDlxPackageNodeModulesDir(packageName), packageName),
  )
}

/**
 * Get the DLX installation directory for a specific package.
 */
export function getDlxPackageDir(packageName: string): string {
  const path = getPath()
  return normalizePath(path.join(getSocketDlxDir(), packageName))
}

/**
 * Get the package.json path for a DLX installed package.
 */
export function getDlxPackageJsonPath(packageName: string): string {
  const path = getPath()
  return normalizePath(
    path.join(getDlxInstalledPackageDir(packageName), 'package.json'),
  )
}

/**
 * Get the node_modules directory for a DLX package installation.
 */
export function getDlxPackageNodeModulesDir(packageName: string): string {
  const path = getPath()
  return normalizePath(path.join(getDlxPackageDir(packageName), 'node_modules'))
}

/**
 * Check if a file path is within the Socket DLX directory.
 * This is useful for determining if a binary or file is managed by Socket's DLX system.
 *
 * @param filePath - Absolute or relative path to check
 * @returns true if the path is within ~/.socket/_dlx/, false otherwise
 *
 * @example
 * ```typescript
 * isInSocketDlx('/home/user/.socket/_dlx/abc123/bin/socket') // true
 * isInSocketDlx('/usr/local/bin/socket') // false
 * isInSocketDlx(process.argv[0]) // Check if current binary is in DLX
 * ```
 */
export function isInSocketDlx(filePath: string): boolean {
  if (!filePath) {
    return false
  }

  const path = getPath()
  const dlxDir = getSocketDlxDir()
  const absolutePath = normalizePath(path.resolve(filePath))

  // Check if the absolute path starts with the DLX directory.
  // Both paths are normalized to use forward slashes for consistent comparison.
  return absolutePath.startsWith(`${dlxDir}/`)
}
