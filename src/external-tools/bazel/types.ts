/**
 * @file Shared types for Bazel resolution.
 */

export type BazelSource = 'vfs' | 'path' | 'download'

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
}
