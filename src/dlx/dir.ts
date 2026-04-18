/** @fileoverview Directory management utilities for DLX installations. */

import { safeMkdir, safeMkdirSync } from '../fs'
import { getSocketDlxDir } from '../paths/socket'
import { pEach } from '../promises'
import {
  listDlxPackages,
  listDlxPackagesAsync,
  removeDlxPackage,
  removeDlxPackageSync,
} from './packages'

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
 * Clear all DLX package installations.
 *
 * @example
 * ```typescript
 * await clearDlx()
 * ```
 */
export async function clearDlx(): Promise<void> {
  const packages = await listDlxPackagesAsync()
  await pEach(packages, pkg => removeDlxPackage(pkg))
}

/**
 * Clear all DLX package installations synchronously.
 *
 * @example
 * ```typescript
 * clearDlxSync()
 * ```
 */
export function clearDlxSync(): void {
  const packages = listDlxPackages()
  for (const pkg of packages) {
    removeDlxPackageSync(pkg)
  }
}

/**
 * Check if the DLX directory exists.
 *
 * @example
 * ```typescript
 * if (dlxDirExists()) {
 *   console.log('DLX directory is present')
 * }
 * ```
 */
export function dlxDirExists(): boolean {
  const fs = getFs()
  return fs.existsSync(getSocketDlxDir())
}

/**
 * Ensure the DLX directory exists, creating it if necessary.
 *
 * @example
 * ```typescript
 * await ensureDlxDir()
 * ```
 */
export async function ensureDlxDir(): Promise<void> {
  await safeMkdir(getSocketDlxDir())
}

/**
 * Ensure the DLX directory exists synchronously, creating it if necessary.
 *
 * @example
 * ```typescript
 * ensureDlxDirSync()
 * ```
 */
export function ensureDlxDirSync(): void {
  safeMkdirSync(getSocketDlxDir())
}
