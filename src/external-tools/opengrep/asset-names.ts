/**
 * @file Upstream OpenGrep release asset-name mapping per `platform-arch`.
 *   OpenGrep publishes raw binaries (no archive wrapper) for macOS and Linux,
 *   and a zipped binary (`opengrep-core_windows_x86.zip` containing
 *   `opengrep-core.exe`) for Windows. The `isArchive` flag tells the download
 *   helper whether to extract or copy as-is.
 */

import { ObjectFreeze } from '../../primordials/object'

export interface OpengrepAssetEntry {
  /**
   * Full asset filename (no version interpolation — OpenGrep keeps asset names
   * version-free).
   */
  readonly asset: string
  /**
   * `true` when the asset is a zip that must be extracted; `false` when the
   * asset IS the binary (just copy + chmod).
   */
  readonly isArchive: boolean
  /**
   * For archive assets, the path inside the zip to the binary. Undefined for
   * bare-binary assets.
   */
  readonly binaryInArchive: string | undefined
}

export const OPENGREP_ASSET_MAP: Readonly<Record<string, OpengrepAssetEntry>> =
  ObjectFreeze({
    __proto__: null,
    'darwin-arm64': ObjectFreeze({
      __proto__: null,
      asset: 'opengrep_osx_arm64',
      isArchive: false,
      binaryInArchive: undefined,
    }) as unknown as OpengrepAssetEntry,
    'darwin-x64': ObjectFreeze({
      __proto__: null,
      asset: 'opengrep_osx_x86',
      isArchive: false,
      binaryInArchive: undefined,
    }) as unknown as OpengrepAssetEntry,
    'linux-arm64': ObjectFreeze({
      __proto__: null,
      asset: 'opengrep_manylinux_aarch64',
      isArchive: false,
      binaryInArchive: undefined,
    }) as unknown as OpengrepAssetEntry,
    'linux-x64': ObjectFreeze({
      __proto__: null,
      asset: 'opengrep_manylinux_x86',
      isArchive: false,
      binaryInArchive: undefined,
    }) as unknown as OpengrepAssetEntry,
    'win-x64': ObjectFreeze({
      __proto__: null,
      asset: 'opengrep-core_windows_x86.zip',
      isArchive: true,
      binaryInArchive: 'opengrep-core.exe',
    }) as unknown as OpengrepAssetEntry,
  }) as unknown as Readonly<Record<string, OpengrepAssetEntry>>

export function getOpengrepAssetEntry(
  platformArch: string,
): OpengrepAssetEntry | undefined {
  return OPENGREP_ASSET_MAP[platformArch]
}

export interface OpengrepDownloadOptions {
  /**
   * OpenGrep release version, e.g. `'1.16.5'` (no `v` prefix; the helper
   * prepends it for the release tag).
   */
  version: string
  /**
   * Fleet platform-arch token — looked up in `OPENGREP_ASSET_MAP`.
   */
  platformArch: string
}

/**
 * Build the GitHub release-asset download URL for an upstream OpenGrep binary.
 * Returns `undefined` when no entry exists for the requested platform-arch.
 *
 * Reference: https://github.com/opengrep/opengrep/releases.
 */
export function getOpengrepDownloadUrl(
  options: OpengrepDownloadOptions,
): string | undefined {
  const { platformArch, version } = {
    __proto__: null,
    ...options,
  } as typeof options
  const entry = OPENGREP_ASSET_MAP[platformArch]
  if (!entry) {
    return undefined
  }
  return (
    `https://github.com/opengrep/opengrep/releases/download/v${version}/` +
    entry.asset
  )
}
