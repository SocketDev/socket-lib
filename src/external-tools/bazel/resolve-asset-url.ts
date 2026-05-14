/**
 * @fileoverview `resolveBazelAssetUrl(version, platformArch)` —
 * builds the upstream GitHub Releases download URL for a Bazel
 * binary. Returns `undefined` if the platform-arch isn't in our
 * asset map.
 *
 * Bazel publishes to
 *   https://github.com/bazelbuild/bazel/releases/download/<X.Y.Z>/bazel-<X.Y.Z>-<suffix>
 * where `<suffix>` is one of `darwin-arm64`, `darwin-x86_64`,
 * `linux-arm64`, `linux-x86_64`, `windows-x86_64.exe`.
 */

import { getBazelAssetEntry } from './asset-names'

export interface BazelAssetUrl {
  readonly url: string
  readonly filename: string
  readonly native: boolean
}

export function resolveBazelAssetUrl(
  version: string,
  platformArch: string,
): BazelAssetUrl | undefined {
  const entry = getBazelAssetEntry(platformArch)
  if (!entry) {
    return undefined
  }
  const filename = `bazel-${version}-${entry.suffix}`
  return {
    url: `https://github.com/bazelbuild/bazel/releases/download/${version}/${filename}`,
    filename,
    native: entry.native,
  }
}
