/**
 * @file Shared types for TruffleHog resolution. TruffleHog is a single-binary
 *   secrets scanner from TruffleSecurity. socket-basics uses it for the SAST
 *   secrets-scan workflow; other Socket tooling can reach for it via
 *   `resolveTrufflehog()`.
 */

import type { ResolvedToolIntegrity } from '../from-download'

export type TrufflehogSource = 'download' | 'path' | 'vfs'

/**
 * A resolved TruffleHog installation.
 */
export interface ResolvedTrufflehog {
  /**
   * Absolute path to the `trufflehog` executable.
   */
  readonly path: string
  /**
   * Which resolver tier found this.
   */
  readonly source: TrufflehogSource
  /**
   * See {@link ResolvedToolIntegrity}.
   */
  readonly integrity?: ResolvedToolIntegrity | undefined
}
