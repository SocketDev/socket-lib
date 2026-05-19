/**
 * @file Shared types for TruffleHog resolution. TruffleHog is a single-binary
 *   secrets scanner from TruffleSecurity. socket-basics uses it for the SAST
 *   secrets-scan workflow; other Socket tooling can reach for it via
 *   `resolveTrufflehog()`.
 */

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
   * SRI integrity (`sha512-<base64>`) of the downloaded archive. Set ONLY when
   * `source === 'download'`; vfs / path tiers don't compute it. Use for
   * trust-on-first-use pinning.
   */
  readonly integrity?: string | undefined
}
