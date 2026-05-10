/**
 * @fileoverview Format detection by file extension.
 */

import { StringPrototypeEndsWith } from '../primordials/string'

import type { ArchiveFormat } from './types'

/**
 * Detect archive format from file path.
 *
 * @param filePath - Path to archive file
 * @returns Archive format or null if unknown
 *
 * @example
 * ```typescript
 * detectArchiveFormat('package.tar.gz')  // 'tar.gz'
 * detectArchiveFormat('archive.zip')     // 'zip'
 * detectArchiveFormat('data.csv')        // null
 * ```
 */
export function detectArchiveFormat(filePath: string): ArchiveFormat | null {
  const lower = filePath.toLowerCase()
  if (StringPrototypeEndsWith(lower, '.tar.gz')) {
    return 'tar.gz'
  }
  if (StringPrototypeEndsWith(lower, '.tgz')) {
    return 'tgz'
  }
  if (StringPrototypeEndsWith(lower, '.tar')) {
    return 'tar'
  }
  if (StringPrototypeEndsWith(lower, '.zip')) {
    return 'zip'
  }
  return null
}
