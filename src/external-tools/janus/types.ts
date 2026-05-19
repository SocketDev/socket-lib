/**
 * @file Shared types for janus resolution. janus is a single-binary tool from
 *   divmain/janus. Currently distributed for macOS aarch64 only; the
 *   platform-arch map will grow as upstream adds builds.
 */

import type { ResolvedToolIntegrity } from '../from-download'

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
   * See {@link ResolvedToolIntegrity}.
   */
  readonly integrity?: ResolvedToolIntegrity
}
