/**
 * @file Shared types for uv resolution. uv is Astral's Python package manager
 *   used by socket-basics for Python project bootstrap. Ships per-platform
 *   archives that wrap the `uv` binary one level deep.
 */

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
   * SRI integrity (`sha512-<base64>`) of the downloaded archive. Set ONLY when
   * `source === 'download'`; vfs / path tiers don't compute it. Use for
   * trust-on-first-use pinning.
   */
  readonly integrity?: string | undefined
}
