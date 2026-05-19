/**
 * @file `trivyFromDownload()` — fetches upstream Trivy and returns a
 *   `ResolvedTrivy` pointing at the extracted binary. macOS/Linux ship tar.gz,
 *   Windows ships zip; `downloadAndExtractTool` auto-detects the format from
 *   the archive name.
 */

import path from 'node:path'
import process from 'node:process'

import { getSocketDlxDir } from '../../paths/socket'
import { downloadAndExtractTool } from '../from-download'

import { getTrivyDownloadUrl, getTrivyAssetEntry } from './asset-names'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { ResolvedTrivy } from './types'

export interface TrivyFromDownloadOptions {
  version: string
  platformArch: string
  integrity?: HashSpec | undefined
  cacheDir?: string | undefined
  downloader?: BinaryDownloader | undefined
}

export async function trivyFromDownload(
  opts: TrivyFromDownloadOptions,
): Promise<ResolvedTrivy | undefined> {
  const { cacheDir, downloader, integrity, platformArch, version } = opts
  const url = getTrivyDownloadUrl({ version, platformArch })
  if (!url) {
    return undefined
  }
  const entry = getTrivyAssetEntry(platformArch)
  // Archive extension is load-bearing: extractArchive picks the right
  // unpacker from the cached filename. `entry.suffix` already carries
  // the right extension (`.tar.gz` for posix, `.zip` for windows).
  const archiveExt = entry?.suffix.endsWith('.zip') ? '.zip' : '.tar.gz'
  const extractedDir =
    cacheDir ?? path.join(getSocketDlxDir(), 'trivy', version, platformArch)
  const archive = await downloadAndExtractTool({
    url,
    name: `trivy-${version}-${platformArch}${archiveExt}`,
    integrity,
    extractedDir,
    downloader,
  })
  const binary = process.platform === 'win32' ? 'trivy.exe' : 'trivy'
  return {
    path: path.join(extractedDir, binary),
    source: 'download',
    integrity: archive.integrity,
  }
}
