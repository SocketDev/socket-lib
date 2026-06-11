/**
 * @file Upstream Bazel release asset-name mapping per `platform-arch`. Bazel's
 *   GitHub Releases use a consistent naming pattern
 *   (`bazel-<version>-<os>-<arch>[.exe]`); this leaf encodes the platform-arch
 *   → suffix map so the bazelisk-style downloader can build the right URL
 *   without spreading the convention. Bazel publishes native binaries for 5 of
 *   socket's 8 targets. The 3 gap targets use compat-layer fallbacks:
 *
 *   - `linux-x64-musl` / `linux-arm64-musl` → glibc binary + gcompat (user must
 *     `apk add gcompat` on Alpine)
 *   - `win-arm64` → Windows x64 binary via Prism emulation Callers can read
 *     `BAZEL_ASSET_MAP[platformArch].native` to see whether the binary is
 *     native to the target or runs under a compat layer.
 */

import { ObjectFreeze } from '../../primordials/object'

export interface BazelAssetEntry {
  /**
   * Asset-name suffix appended to `bazel-<version>-`.
   */
  readonly suffix: string
  /**
   * `true` if this is an upstream-native build; `false` if it runs via compat.
   */
  readonly native: boolean
  /**
   * Human-readable note about compatibility quirks (if any).
   */
  readonly note: string | undefined
}

export const BAZEL_ASSET_MAP: Readonly<Record<string, BazelAssetEntry>> =
  ObjectFreeze({
    __proto__: null,
    'darwin-arm64': ObjectFreeze({
      __proto__: null,
      suffix: 'darwin-arm64',
      native: true,
      note: undefined,
    }) as unknown as BazelAssetEntry,
    'darwin-x64': ObjectFreeze({
      __proto__: null,
      suffix: 'darwin-x86_64',
      native: true,
      note: undefined,
    }) as unknown as BazelAssetEntry,
    'linux-arm64': ObjectFreeze({
      __proto__: null,
      suffix: 'linux-arm64',
      native: true,
      note: undefined,
    }) as unknown as BazelAssetEntry,
    'linux-arm64-musl': ObjectFreeze({
      __proto__: null,
      suffix: 'linux-arm64',
      native: false,
      note: 'Runs under gcompat on Alpine; `apk add gcompat` required.',
    }) as unknown as BazelAssetEntry,
    'linux-x64': ObjectFreeze({
      __proto__: null,
      suffix: 'linux-x86_64',
      native: true,
      note: undefined,
    }) as unknown as BazelAssetEntry,
    'linux-x64-musl': ObjectFreeze({
      __proto__: null,
      suffix: 'linux-x86_64',
      native: false,
      note: 'Runs under gcompat on Alpine; `apk add gcompat` required.',
    }) as unknown as BazelAssetEntry,
    'win-arm64': ObjectFreeze({
      __proto__: null,
      suffix: 'windows-x86_64.exe',
      native: false,
      note: 'Runs under Prism x86_64 emulation on Windows ARM64.',
    }) as unknown as BazelAssetEntry,
    'win-x64': ObjectFreeze({
      __proto__: null,
      suffix: 'windows-x86_64.exe',
      native: true,
      note: undefined,
    }) as unknown as BazelAssetEntry,
  }) as unknown as Readonly<Record<string, BazelAssetEntry>>

export function getBazelAssetEntry(
  platformArch: string,
): BazelAssetEntry | undefined {
  return BAZEL_ASSET_MAP[platformArch]
}

/**
 * Options for {@link getBazelDownloadUrl}.
 */
export interface BazelDownloadOptions {
  /**
   * Bazel release version, e.g. `'7.4.1'`. Passed verbatim into the release tag
   * — the helper doesn't validate against bazel's release feed, it just formats
   * the URL.
   */
  version: string
  /**
   * Fleet platform-arch token — looked up in `BAZEL_ASSET_MAP`. Returns
   * `undefined` when no entry exists for the target.
   */
  platformArch: string
}

/**
 * Build the GitHub release-asset download URL for an upstream Bazel binary.
 * Returns `undefined` when no entry exists for the requested platform-arch.
 *
 * Note: the underlying asset may be a compat-layer build (see
 * `BazelAssetEntry.native`). Callers that require a native binary should check
 * `getBazelAssetEntry(platformArch).native` before downloading.
 *
 * Reference: https://github.com/bazelbuild/bazel/releases.
 *
 * @example
 *   ;```typescript
 *   const url = getBazelDownloadUrl({
 *     version: '7.4.1',
 *     platformArch: 'darwin-arm64',
 *   })
 *   // → 'https://github.com/bazelbuild/bazel/releases/download/7.4.1/bazel-7.4.1-darwin-arm64'
 *   ```
 */
export function getBazelDownloadUrl(
  options: BazelDownloadOptions,
): string | undefined {
  const { platformArch, version } = {
    __proto__: null,
    ...options,
  } as typeof options
  const entry = BAZEL_ASSET_MAP[platformArch]
  if (!entry) {
    return undefined
  }
  return (
    `https://github.com/bazelbuild/bazel/releases/download/${version}/` +
    `bazel-${version}-${entry.suffix}`
  )
}
