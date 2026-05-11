/** @fileoverview Directory management utilities for DLX installations. */

import { safeMkdir, safeMkdirSync } from '../fs/safe'
import { getSocketDlxDir } from '../paths/socket'
import { pEach } from '../promises/iterate'
import { getNodeFs } from '../node/fs'
import {
  listDlxPackages,
  listDlxPackagesAsync,
  removeDlxPackage,
  removeDlxPackageSync,
} from './packages'
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
  const fs = getNodeFs()
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
