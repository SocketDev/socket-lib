/**
 * @file Upstream Trivy release asset-name mapping per `platform-arch`. Trivy
 *   publishes per-platform archives under
 *   https://github.com/aquasecurity/trivy/releases/download/v<X.Y.Z>/. Asset
 *   names follow `trivy_<X.Y.Z>_<OS>-<Arch>.{tar.gz,zip}` where `<OS>` is
 *   `macOS` / `Linux` / `windows` and `<Arch>` is `ARM64` / `64bit`.
 *   Capitalization matters.
 */

import { ObjectFreeze } from '../../primordials/object.mjs'

export interface TrivyAssetEntry {
  /**
   * Asset-name suffix appended to `trivy_<version>_`.
   */
  readonly suffix: string
}

// oxlint-disable-next-line socket/prefer-refined-record -- frozen asset table
export const TRIVY_ASSET_MAP: Readonly<Record<string, TrivyAssetEntry>> =
  ObjectFreeze({
    __proto__: null,
    'darwin-arm64': ObjectFreeze({
      __proto__: null,
      suffix: 'macOS-ARM64.tar.gz',
    }) as unknown as TrivyAssetEntry,
    'darwin-x64': ObjectFreeze({
      __proto__: null,
      suffix: 'macOS-64bit.tar.gz',
    }) as unknown as TrivyAssetEntry,
    'linux-arm64': ObjectFreeze({
      __proto__: null,
      suffix: 'Linux-ARM64.tar.gz',
    }) as unknown as TrivyAssetEntry,
    'linux-x64': ObjectFreeze({
      __proto__: null,
      suffix: 'Linux-64bit.tar.gz',
    }) as unknown as TrivyAssetEntry,
    'win-x64': ObjectFreeze({
      __proto__: null,
      suffix: 'windows-64bit.zip',
    }) as unknown as TrivyAssetEntry,
    // oxlint-disable-next-line socket/prefer-refined-record -- frozen
  }) as unknown as Readonly<Record<string, TrivyAssetEntry>>

export function getTrivyAssetEntry(
  platformArch: string,
): TrivyAssetEntry | undefined {
  return TRIVY_ASSET_MAP[platformArch]
}

export interface TrivyDownloadOptions {
  /**
   * Trivy release version, e.g. `'0.69.3'` (no `v` prefix; the helper prepends
   * it for the release tag).
   */
  version: string
  /**
   * Socket platform-arch token — looked up in `TRIVY_ASSET_MAP`.
   */
  platformArch: string
}

/**
 * Build the GitHub release-asset download URL for an upstream Trivy binary.
 * Returns `undefined` when no entry exists for the requested platform-arch.
 *
 * Reference: https://github.com/aquasecurity/trivy/releases.
 */
export function getTrivyDownloadUrl(
  options: TrivyDownloadOptions,
): string | undefined {
  const { platformArch, version } = {
    __proto__: null,
    ...options,
  } as typeof options
  const entry = TRIVY_ASSET_MAP[platformArch]
  if (!entry) {
    return undefined
  }
  return (
    `https://github.com/aquasecurity/trivy/releases/download/v${version}/` +
    `trivy_${version}_${entry.suffix}`
  )
}
