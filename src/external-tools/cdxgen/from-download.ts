/**
 * @file `cdxgenFromDownload()` — fetches the upstream cdxgen SEA binary (slim
 *   by default) and returns a `ResolvedCdxgen` pointing at the cached
 *   executable. cdxgen ships bare-binary assets per platform (no archive
 *   wrapper) with sidecar `.sha256` files; this helper passes the pinned
 *   integrity through `downloadToolArchive`, then copies the downloaded blob to
 *   `cdxgen[.exe]` and chmods it 0o755. Platforms upstream doesn't ship a SEA
 *   for (none today; the asset map covers all 8 fleet targets) return
 *   `undefined` — callers should fall back to `cdxgenFromNpm()` for those.
 */

import { promises as fsPromises } from 'node:fs'
import path from 'node:path'
import process from 'node:process'

import { safeMkdir } from '../../fs/safe'
import { getSocketDlxDir } from '../../paths/socket'
import { downloadToolArchive } from '../from-download'

import { getCdxgenAssetEntry, getCdxgenDownloadUrl } from './asset-names'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { CdxgenVariant } from './asset-names'
import type { ResolvedCdxgen } from './types'

export interface CdxgenFromDownloadOptions {
  /**
   * Cdxgen release version, e.g. `'12.4.1'`.
   */
  version: string
  /**
   * Fleet platform-arch token, e.g. `'darwin-arm64'`.
   */
  platformArch: string
  /**
   * Slim (default — no bundled bun/deno) or full (bundles both).
   */
  variant?: CdxgenVariant | undefined
  /**
   * Optional pinned integrity from `external-tools.json`.
   */
  integrity?: HashSpec | undefined
  /**
   * Override the cache directory. By default the binary lands under
   * `<getSocketDlxDir()>/cdxgen/<version>/<platformArch>-<variant>/`.
   */
  cacheDir?: string | undefined
  /**
   * Inject a custom downloader. Forwarded to the underlying
   * `downloadToolArchive`. Defaults to dlx.
   */
  downloader?: BinaryDownloader | undefined
}

export async function cdxgenFromDownload(
  opts: CdxgenFromDownloadOptions,
): Promise<ResolvedCdxgen | undefined> {
  const {
    cacheDir,
    downloader,
    integrity,
    platformArch,
    variant = 'slim',
    version,
  } = { __proto__: null, ...opts } as typeof opts
  const url = getCdxgenDownloadUrl({ platformArch, variant, version })
  const entry = getCdxgenAssetEntry(platformArch, variant)
  if (!url || !entry) {
    return undefined
  }
  // cdxgen ships bare binaries — no archive extraction. Download via
  // `downloadToolArchive` (which handles dlx caching + sha256), then
  // copy into the final cache dir under the canonical `cdxgen[.exe]`
  // name so callers don't need to know the upstream asset name.
  const archive = await downloadToolArchive({
    url,
    name: `cdxgen-${version}-${platformArch}-${variant}-${entry.asset}`,
    integrity,
    downloader,
  })
  const targetDir =
    cacheDir ??
    path.join(
      getSocketDlxDir(),
      'cdxgen',
      version,
      `${platformArch}-${variant}`,
    )
  await safeMkdir(targetDir)
  const ext = process.platform === 'win32' ? '.exe' : ''
  const finalPath = path.join(targetDir, `cdxgen${ext}`)
  await fsPromises.copyFile(archive.archivePath, finalPath)
  await fsPromises.chmod(finalPath, 0o755)
  return {
    path: finalPath,
    source: 'download',
    integrity: archive.integrity,
  }
}
