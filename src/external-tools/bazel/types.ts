/**
 * @file Shared types for Bazel resolution.
 */

import type { ResolvedToolIntegrity } from '../from-download'

export type BazelSource = 'download' | 'path'

/**
 * A resolved Bazel installation.
 */
export interface ResolvedBazel {
  /**
   * Absolute path to the `bazel` (or `bazelisk`) executable.
   */
  readonly path: string
  /**
   * Which resolver tier found this.
   */
  readonly source: BazelSource
  /**
   * See {@link ResolvedToolIntegrity}.
   */
  readonly integrity?: ResolvedToolIntegrity | undefined
}
