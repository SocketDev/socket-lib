/**
 * @file Result type for a checksum-pinned socket-keychain installation.
 */

import type { ResolvedToolIntegrity } from '../from-download'

export interface ResolvedSocketKeychain {
  /**
   * SHA integrity computed or verified by the download layer.
   */
  readonly integrity: ResolvedToolIntegrity
  /**
   * Absolute path to the racked executable.
   */
  readonly path: string
  readonly source: 'download'
}
