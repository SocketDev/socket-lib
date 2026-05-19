/**
 * @file Upstream TruffleHog release asset-name mapping per `platform-arch`.
 *   TruffleHog publishes a single tar.gz per platform-arch under
 *   https://github.com/trufflesecurity/trufflehog/releases/download/v<X.Y.Z>/.
 *   Asset names follow `trufflehog_<X.Y.Z>_<os>_<arch>.tar.gz`.
 */

import { ObjectFreeze } from '../../primordials/object'

export interface TrufflehogAssetEntry {
  /**
   * Asset-name suffix appended to `trufflehog_<version>_`.
   */
  readonly suffix: string
}

export const TRUFFLEHOG_ASSET_MAP: Readonly<
  Record<string, TrufflehogAssetEntry>
> = ObjectFreeze({
  __proto__: null,
  'darwin-arm64': ObjectFreeze({
    __proto__: null,
    suffix: 'darwin_arm64.tar.gz',
  }) as unknown as TrufflehogAssetEntry,
  'darwin-x64': ObjectFreeze({
    __proto__: null,
    suffix: 'darwin_amd64.tar.gz',
  }) as unknown as TrufflehogAssetEntry,
  'linux-arm64': ObjectFreeze({
    __proto__: null,
    suffix: 'linux_arm64.tar.gz',
  }) as unknown as TrufflehogAssetEntry,
  'linux-x64': ObjectFreeze({
    __proto__: null,
    suffix: 'linux_amd64.tar.gz',
  }) as unknown as TrufflehogAssetEntry,
  'win-arm64': ObjectFreeze({
    __proto__: null,
    suffix: 'windows_arm64.tar.gz',
  }) as unknown as TrufflehogAssetEntry,
  'win-x64': ObjectFreeze({
    __proto__: null,
    suffix: 'windows_amd64.tar.gz',
  }) as unknown as TrufflehogAssetEntry,
}) as unknown as Readonly<Record<string, TrufflehogAssetEntry>>

export function getTrufflehogAssetEntry(
  platformArch: string,
): TrufflehogAssetEntry | undefined {
  return TRUFFLEHOG_ASSET_MAP[platformArch]
}

export interface TrufflehogDownloadOptions {
  /**
   * TruffleHog release version, e.g. `'3.93.8'` (no `v` prefix; the helper
   * prepends it).
   */
  version: string
  /**
   * Fleet platform-arch token — looked up in `TRUFFLEHOG_ASSET_MAP`. Returns
   * `undefined` when no entry exists for the target.
   */
  platformArch: string
}

/**
 * Build the GitHub release-asset download URL for an upstream TruffleHog
 * binary. Returns `undefined` when no entry exists for the requested
 * platform-arch.
 *
 * Reference: https://github.com/trufflesecurity/trufflehog/releases.
 */
export function getTrufflehogDownloadUrl(
  opts: TrufflehogDownloadOptions,
): string | undefined {
  const { platformArch, version } = opts
  const entry = TRUFFLEHOG_ASSET_MAP[platformArch]
  if (!entry) {
    return undefined
  }
  return (
    `https://github.com/trufflesecurity/trufflehog/releases/download/v${version}/` +
    `trufflehog_${version}_${entry.suffix}`
  )
}
