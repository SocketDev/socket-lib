/**
 * @file Public type surface for `archives/*` modules — the `ArchiveFormat`
 *   union, the `ExtractOptions` security-limit record, and the three default
 *   limits that record documents. No imports and no side effects, which is
 *   load-bearing: `npm/registry/tarball/shared` reads the defaults from here
 *   on the BROWSER path, and the sibling `archives/shared` cannot serve them
 *   because it also owns the adm-zip / tar-fs / `node:fs` accessors.
 */

/**
 * Archive format type.
 */
export type ArchiveFormat = 'tar' | 'tar.gz' | 'tgz' | 'zip'

/**
 * Maximum number of entries extracted from one archive, 100,000. Guards
 * against an inode-exhaustion DoS.
 */
export const DEFAULT_MAX_ENTRIES = 100_000

/**
 * Maximum size of a single extracted file, 100MB.
 */
export const DEFAULT_MAX_FILE_SIZE = 100 * 1024 * 1024

/**
 * Maximum total extracted size across an archive, 1GB.
 */
export const DEFAULT_MAX_TOTAL_SIZE = 1024 * 1024 * 1024

/**
 * Options for archive extraction.
 */
export interface ExtractOptions {
  /**
   * Suppress log messages.
   */
  quiet?: boolean | undefined
  /**
   * Strip leading path components (like tar --strip-components)
   */
  strip?: number | undefined
  /**
   * Maximum number of entries to extract (default: 100,000)
   */
  maxEntries?: number | undefined
  /**
   * Maximum size of a single extracted file in bytes (default: 100MB)
   */
  maxFileSize?: number | undefined
  /**
   * Maximum total extracted size in bytes (default: 1GB)
   */
  maxTotalSize?: number | undefined
}
