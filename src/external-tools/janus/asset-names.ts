/**
 * @file Upstream janus release asset-name mapping per `platform-arch`. janus
 *   publishes per-platform tarballs under
 *   https://github.com/divmain/janus/releases/download/v<X.Y.Z>/. At v1.22.0
 *   only darwin-arm64 is shipped; this map will expand as upstream adds builds.
 *   Callers receive `undefined` for unsupported platforms — surface that as an
 *   actionable "janus is mac-arm64 only" error rather than blindly fetching a
 *   404.
 */

import { ObjectFreeze } from '../../primordials/object'

export interface JanusAssetEntry {
  /**
   * Full asset filename (version-free; the helper interpolates the tag).
   */
  readonly asset: string
}

export const JANUS_ASSET_MAP: Readonly<Record<string, JanusAssetEntry>> =
  ObjectFreeze({
    __proto__: null,
    'darwin-arm64': ObjectFreeze({
      __proto__: null,
      asset: 'janus-aarch64-apple-darwin.tar.gz',
    }) as unknown as JanusAssetEntry,
  }) as unknown as Readonly<Record<string, JanusAssetEntry>>

export function getJanusAssetEntry(
  platformArch: string,
): JanusAssetEntry | undefined {
  return JANUS_ASSET_MAP[platformArch]
}

export interface JanusDownloadOptions {
  /**
   * Janus release version, e.g. `'1.22.0'` (no `v` prefix; the helper prepends
   * it for the release tag).
   */
  version: string
  /**
   * Fleet platform-arch token — looked up in `JANUS_ASSET_MAP`. Returns
   * `undefined` for any platform-arch janus doesn't ship a build for.
   */
  platformArch: string
}

/**
 * Build the GitHub release-asset download URL for an upstream janus binary.
 * Returns `undefined` when no entry exists for the requested platform-arch.
 *
 * Reference: https://github.com/divmain/janus/releases.
 */
export function getJanusDownloadUrl(
  opts: JanusDownloadOptions,
): string | undefined {
  const { platformArch, version } = opts
  const entry = JANUS_ASSET_MAP[platformArch]
  if (!entry) {
    return undefined
  }
  return (
    `https://github.com/divmain/janus/releases/download/v${version}/` +
    entry.asset
  )
}
