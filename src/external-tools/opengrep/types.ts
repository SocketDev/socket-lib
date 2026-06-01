/**
 * @file Shared types for OpenGrep resolution. OpenGrep is a semgrep fork used
 *   by socket-basics for SAST. Ships as bare binaries on macOS/Linux (no
 *   archive wrapper) and as a zip on Windows.
 */

import type { ResolvedToolIntegrity } from '../from-download'

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
   * See {@link ResolvedToolIntegrity}.
   */
  readonly integrity?: ResolvedToolIntegrity | undefined
}
