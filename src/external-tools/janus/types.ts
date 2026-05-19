/**
 * @file Shared types for janus resolution. janus is a single-binary tool from
 *   divmain/janus. Currently distributed for macOS aarch64 only; the
 *   platform-arch map will grow as upstream adds builds.
 */

export type JanusSource = 'download' | 'path' | 'vfs'

/**
 * A resolved janus installation.
 */
export interface ResolvedJanus {
  /**
   * Absolute path to the `janus` executable.
   */
  readonly path: string
  /**
   * Which resolver tier found this.
   */
  readonly source: JanusSource
  /**
   * SRI integrity (`sha512-<base64>`) of the downloaded archive. Set ONLY when
   * `source === 'download'`; vfs / path tiers don't compute it. Use for
   * trust-on-first-use pinning.
   */
  readonly integrity?: string | undefined
}
