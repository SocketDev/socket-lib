/**
 * @file Shared types for Bazel resolution.
 */

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
   * SRI integrity (`sha512-<base64>`) of the downloaded archive. Set ONLY when
   * `source === 'download'`; PATH-tier resolutions don't compute it. Use for
   * trust-on-first-use pinning.
   */
  readonly integrity?: string | undefined
}
