/**
 * @file Shared types for Trivy resolution. Trivy is Aqua Security's
 *   single-binary vulnerability + IaC + SBOM scanner. socket-basics uses it for
 *   container + filesystem scanning.
 */

import type { ResolvedToolIntegrity } from '../from-download'

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
   * See {@link ResolvedToolIntegrity}.
   */
  readonly integrity?: ResolvedToolIntegrity | undefined
}
