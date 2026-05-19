/**
 * @file Shared types for OpenGrep resolution. OpenGrep is a semgrep fork used
 *   by socket-basics for SAST. Ships as bare binaries on macOS/Linux (no
 *   archive wrapper) and as a zip on Windows.
 */

export type OpengrepSource = 'download' | 'path' | 'vfs'

/**
 * A resolved OpenGrep installation.
 */
export interface ResolvedOpengrep {
  /**
   * Absolute path to the `opengrep` executable.
   */
  readonly path: string
  /**
   * Which resolver tier found this.
   */
  readonly source: OpengrepSource
  /**
   * SRI integrity (`sha512-<base64>`) of the downloaded binary or archive. Set
   * ONLY when `source === 'download'`; vfs / path tiers don't compute it. Use
   * for trust-on-first-use pinning.
   */
  readonly integrity?: string | undefined
}
