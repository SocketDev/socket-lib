/**
 * @file Shared types for Trivy resolution. Trivy is Aqua Security's
 *   single-binary vulnerability + IaC + SBOM scanner. socket-basics uses it for
 *   container + filesystem scanning.
 */

export type TrivySource = 'download' | 'path' | 'vfs'

/**
 * A resolved Trivy installation.
 */
export interface ResolvedTrivy {
  /**
   * Absolute path to the `trivy` executable.
   */
  readonly path: string
  /**
   * Which resolver tier found this.
   */
  readonly source: TrivySource
  /**
   * SRI integrity (`sha512-<base64>`) of the downloaded archive. Set ONLY when
   * `source === 'download'`; vfs / path tiers don't compute it. Use for
   * trust-on-first-use pinning.
   */
  readonly integrity?: string | undefined
}
