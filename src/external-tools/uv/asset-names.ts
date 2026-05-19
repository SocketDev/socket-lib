/**
 * @file Upstream uv release asset-name mapping per `platform-arch`. uv
 *   publishes per-platform archives under
 *   https://github.com/astral-sh/uv/releases/download/<X.Y.Z>/. The release tag
 *   is the bare semver (no `v` prefix), unlike most upstream projects. Each
 *   archive wraps the binary one directory deep (`uv-<triple>/uv[.exe]`), so
 *   callers should pass `strip: 1` to the extractor — or, equivalently, look up
 *   the binary inside the archive's stem directory.
 */

import { ObjectFreeze } from '../../primordials/object'

export interface UvAssetEntry {
  /**
   * Full asset filename (no version interpolation — uv asset names are
   * version-free).
   */
  readonly asset: string
}

export const UV_ASSET_MAP: Readonly<Record<string, UvAssetEntry>> =
  ObjectFreeze({
    __proto__: null,
    'darwin-arm64': ObjectFreeze({
      __proto__: null,
      asset: 'uv-aarch64-apple-darwin.tar.gz',
    }) as unknown as UvAssetEntry,
    'darwin-x64': ObjectFreeze({
      __proto__: null,
      asset: 'uv-x86_64-apple-darwin.tar.gz',
    }) as unknown as UvAssetEntry,
    'linux-arm64': ObjectFreeze({
      __proto__: null,
      asset: 'uv-aarch64-unknown-linux-gnu.tar.gz',
    }) as unknown as UvAssetEntry,
    'linux-arm64-musl': ObjectFreeze({
      __proto__: null,
      asset: 'uv-aarch64-unknown-linux-musl.tar.gz',
    }) as unknown as UvAssetEntry,
    'linux-x64': ObjectFreeze({
      __proto__: null,
      asset: 'uv-x86_64-unknown-linux-gnu.tar.gz',
    }) as unknown as UvAssetEntry,
    'linux-x64-musl': ObjectFreeze({
      __proto__: null,
      asset: 'uv-x86_64-unknown-linux-musl.tar.gz',
    }) as unknown as UvAssetEntry,
    'win-arm64': ObjectFreeze({
      __proto__: null,
      asset: 'uv-aarch64-pc-windows-msvc.zip',
    }) as unknown as UvAssetEntry,
    'win-x64': ObjectFreeze({
      __proto__: null,
      asset: 'uv-x86_64-pc-windows-msvc.zip',
    }) as unknown as UvAssetEntry,
  }) as unknown as Readonly<Record<string, UvAssetEntry>>

export function getUvAssetEntry(
  platformArch: string,
): UvAssetEntry | undefined {
  return UV_ASSET_MAP[platformArch]
}

export interface UvDownloadOptions {
  /**
   * Uv release version, e.g. `'0.10.11'` (no `v` prefix — astral-sh/uv tags
   * releases as bare semver).
   */
  version: string
  /**
   * Fleet platform-arch token — looked up in `UV_ASSET_MAP`.
   */
  platformArch: string
}

/**
 * Build the GitHub release-asset download URL for an upstream uv binary.
 * Returns `undefined` when no entry exists for the requested platform-arch.
 *
 * Reference: https://github.com/astral-sh/uv/releases.
 */
export function getUvDownloadUrl(opts: UvDownloadOptions): string | undefined {
  const { platformArch, version } = opts
  const entry = UV_ASSET_MAP[platformArch]
  if (!entry) {
    return undefined
  }
  return (
    `https://github.com/astral-sh/uv/releases/download/${version}/` +
    entry.asset
  )
}
