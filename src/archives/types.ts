/**
 * @file Public type surface for `archives/*` modules — the `ArchiveFormat`
 *   union and the `ExtractOptions` security-limit record. Pure types, no
 *   runtime side effects.
 */

/**
 * Archive format type.
 */
export type ArchiveFormat = 'tar' | 'tar.gz' | 'tgz' | 'zip'

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
