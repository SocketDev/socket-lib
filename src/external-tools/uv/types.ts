/**
 * @file Shared types for uv resolution. uv is Astral's Python package manager
 *   used by socket-basics for Python project bootstrap. Ships per-platform
 *   archives that wrap the `uv` binary one level deep.
 */

import type { ResolvedToolIntegrity } from '../from-download'

export type UvSource = 'download' | 'path' | 'vfs'

/**
 * A resolved uv installation.
 */
export interface ResolvedUv {
  /**
   * Absolute path to the `uv` executable.
   */
  readonly path: string
  /**
   * Which resolver tier found this.
   */
  readonly source: UvSource
  /**
   * See {@link ResolvedToolIntegrity}.
   */
  readonly integrity?: ResolvedToolIntegrity | undefined
}
