/**
 * @file `bazelFromDownload()` — fetches the upstream Bazel binary and returns a
 *   `ResolvedBazel` pointing at the cached executable. Bazel ships as a single
 *   executable per platform (no tar/zip wrapper), so this tier uses
 *   `downloadToolArchive` directly — no extraction step. The dlx downloader
 *   already chmods the file to 0o755 on POSIX, so the cached path is runnable
 *   as soon as it lands on disk. Returns `undefined` when Bazel doesn't publish
 *   a build for the target `platformArch` (no entry in `BAZEL_ASSET_MAP`).
 *   Trust-on-first-use: pass `integrity` from `external-tools.json` when
 *   available. Omit on first install; the underlying call computes the SRI and
 *   writes it into the dlx cache metadata so a follow-up `external-tools.json`
 *   update can pin it.
 */

import { downloadToolArchive } from '../from-download'

import { getBazelDownloadUrl } from './asset-names'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { ResolvedBazel } from './types'

export interface BazelFromDownloadOptions {
  /**
   * Bazel release version, e.g. `'7.4.1'`.
   */
  version: string
  /**
   * Fleet platform-arch token, e.g. `'darwin-arm64'`.
   */
  platformArch: string
  /**
   * Optional pinned integrity from `external-tools.json`.
   */
  integrity?: HashSpec | undefined
  /**
   * Inject a custom downloader. Forwarded to the underlying
   * `downloadToolArchive`. Defaults to dlx.
   */
  downloader?: BinaryDownloader | undefined
}

/**
 * Resolve Bazel by downloading the upstream binary. Returns the standard
 * `ResolvedBazel` shape with `source: 'download'`.
 *
 * @example
 *   ;```typescript
 *   const bazel = await bazelFromDownload({
 *     version: '7.4.1',
 *     platformArch: 'darwin-arm64',
 *   })
 *   // → { path: '/.../bazel-7.4.1-darwin-arm64', source: 'download' }
 *   ```
 */
export async function bazelFromDownload(
  opts: BazelFromDownloadOptions,
): Promise<ResolvedBazel | undefined> {
  const { downloader, integrity, platformArch, version } = opts
  const url = getBazelDownloadUrl({ version, platformArch })
  if (!url) {
    return undefined
  }
  const archive = await downloadToolArchive({
    url,
    name: `bazel-${version}-${platformArch}`,
    integrity,
    downloader,
  })
  return {
    path: archive.archivePath,
    source: 'download',
  }
}
