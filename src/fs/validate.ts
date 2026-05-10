/**
 * @fileoverview Pre-flight readability check for file lists. Used to
 * filter out paths that exist in glob results but cannot be opened —
 * Yarn Berry PnP virtual filesystem entries, pnpm symlinks pointing
 * into a missing content-addressable store, or filesystem races during
 * CI runs.
 */

import { getNodeFs } from '../node/fs'

import type { ValidateFilesResult } from './types'

/**
 * Validate that file paths are readable before processing.
 * Filters out files from glob results that cannot be accessed (common with
 * Yarn Berry PnP virtual filesystem, pnpm content-addressable store symlinks,
 * or filesystem race conditions in CI/CD environments).
 *
 * This defensive pattern prevents ENOENT errors when files exist in glob
 * results but are not accessible via standard filesystem operations.
 *
 * @param filepaths - Array of file paths to validate
 * @returns Object with `validPaths` (readable) and `invalidPaths` (unreadable)
 *
 * @example
 * ```ts
 * import { validateFiles } from '@socketsecurity/lib/fs/validate'
 *
 * const files = ['package.json', '.pnp.cjs/virtual-file.json']
 * const { validPaths, invalidPaths } = validateFiles(files)
 *
 * console.log(`Valid: ${validPaths.length}`)
 * console.log(`Invalid: ${invalidPaths.length}`)
 * ```
 *
 * @example
 * ```ts
 * // Typical usage in Socket CLI commands
 * const packagePaths = await getPackageFilesForScan(targets)
 * const { validPaths } = validateFiles(packagePaths)
 * await sdk.uploadManifestFiles(orgSlug, validPaths)
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function validateFiles(
  filepaths: string[] | readonly string[],
): ValidateFilesResult {
  const fs = getNodeFs()
  const validPaths: string[] = []
  const invalidPaths: string[] = []
  const { R_OK } = fs.constants

  for (const filepath of filepaths) {
    try {
      // oxlint-disable-next-line socket/prefer-exists-sync -- accessSync(R_OK) checks read permission, not just existence.
      fs.accessSync(filepath, R_OK)
      validPaths.push(filepath)
    } catch {
      invalidPaths.push(filepath)
    }
  }

  return { __proto__: null, validPaths, invalidPaths } as ValidateFilesResult
}
