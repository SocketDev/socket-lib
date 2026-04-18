/** @fileoverview Package management utilities for DLX installations. */

import { readDirNamesSync, safeDelete, safeDeleteSync } from '../fs'
import { getSocketDlxDir } from '../paths/socket'
import { getDlxInstalledPackageDir, getDlxPackageDir } from './paths'

let _fs: typeof import('node:fs') | undefined
/**
 * Lazily load the fs module to avoid Webpack errors.
 * Uses non-'node:' prefixed require to prevent Webpack bundling issues.
 *
 * @returns The Node.js fs module
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getFs() {
  if (_fs === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _fs = /*@__PURE__*/ require('node:fs')
  }
  return _fs as typeof import('node:fs')
}

/**
 * Check if a package is installed in DLX.
 *
 * @example
 * ```typescript
 * if (isDlxPackageInstalled('prettier')) {
 *   console.log('prettier is installed')
 * }
 * ```
 */
export function isDlxPackageInstalled(packageName: string): boolean {
  const fs = getFs()
  return fs.existsSync(getDlxInstalledPackageDir(packageName))
}

/**
 * List all packages installed in DLX.
 *
 * @example
 * ```typescript
 * const packages = listDlxPackages()
 * console.log('Installed:', packages.join(', '))
 * ```
 */
export function listDlxPackages(): string[] {
  try {
    return readDirNamesSync(getSocketDlxDir(), { sort: true })
  } catch {
    return []
  }
}

/**
 * List all packages installed in DLX asynchronously.
 *
 * @example
 * ```typescript
 * const packages = await listDlxPackagesAsync()
 * console.log('Installed:', packages.join(', '))
 * ```
 */
export async function listDlxPackagesAsync(): Promise<string[]> {
  const fs = getFs()
  try {
    const entries = await fs.promises.readdir(getSocketDlxDir(), {
      withFileTypes: true,
    })
    return entries
      .filter(e => e.isDirectory())
      .map(e => e.name)
      .sort()
  } catch {
    return []
  }
}

/**
 * Remove a DLX package installation.
 *
 * @example
 * ```typescript
 * await removeDlxPackage('prettier')
 * ```
 */
export async function removeDlxPackage(packageName: string): Promise<void> {
  const packageDir = getDlxPackageDir(packageName)
  try {
    await safeDelete(packageDir, { recursive: true, force: true })
  } catch (e) {
    throw new Error(`Failed to remove DLX package "${packageName}"`, {
      cause: e,
    })
  }
}

/**
 * Remove a DLX package installation synchronously.
 *
 * @example
 * ```typescript
 * removeDlxPackageSync('prettier')
 * ```
 */
export function removeDlxPackageSync(packageName: string): void {
  const packageDir = getDlxPackageDir(packageName)
  try {
    safeDeleteSync(packageDir, { recursive: true, force: true })
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'EACCES' || code === 'EPERM') {
      throw new Error(
        `Permission denied removing DLX package "${packageName}"\n` +
          `Directory: ${packageDir}\n` +
          'To resolve:\n' +
          '  1. Check file/directory permissions\n' +
          '  2. Close any programs using files in this directory\n' +
          '  3. Try running with elevated privileges if necessary\n' +
          `  4. Manually remove: rm -rf "${packageDir}"`,
        { cause: e },
      )
    }
    if (code === 'EROFS') {
      throw new Error(
        `Cannot remove DLX package "${packageName}" from read-only filesystem\n` +
          `Directory: ${packageDir}\n` +
          'The filesystem is mounted read-only.',
        { cause: e },
      )
    }
    throw new Error(
      `Failed to remove DLX package "${packageName}"\n` +
        `Directory: ${packageDir}\n` +
        'Check permissions and ensure no programs are using this directory.',
      { cause: e },
    )
  }
}
