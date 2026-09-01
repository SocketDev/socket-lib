/**
 * @file `trivyFromDownload()` — fetches upstream Trivy and returns a
 *   `ResolvedTrivy` pointing at the extracted binary. macOS/Linux ship tar.gz,
 *   Windows ships zip; `downloadAndExtractTool` auto-detects the format from
 *   the archive name.
 */

import { getSocketDlxDir } from '../../paths/socket.mjs'
import { downloadAndExtractTool } from '../from-download.mjs'

import { getTrivyAssetEntry, getTrivyDownloadUrl } from './asset-names.mjs'

import type { BinaryDownloader } from '../from-download.mjs'
import type { HashInput } from '../../crypto/integrity.mjs'
import type { ResolvedTrivy } from './types.mjs'
import { getNodePath } from '../../node/path.mjs'
import { getNodeProcess } from '../../node/process.mjs'

export interface TrivyFromDownloadOptions {
  version: string
  platformArch: string
  integrity?: HashInput | undefined
  cacheDir?: string | undefined
  downloader?: BinaryDownloader | undefined
}

export async function trivyFromDownload(
  options: TrivyFromDownloadOptions,
): Promise<ResolvedTrivy | undefined> {
  const { cacheDir, downloader, integrity, platformArch, version } = {
    __proto__: null,
    ...options,
  } as typeof options
  const url = getTrivyDownloadUrl({ version, platformArch })
  if (!url) {
    return undefined
  }
  const entry = getTrivyAssetEntry(platformArch)
  // Archive extension is load-bearing: extractArchive picks the right
  // unpacker from the cached filename. `entry.suffix` already carries
  // the right extension (`.tar.gz` for posix, `.zip` for windows).
  const archiveExt = entry?.suffix.endsWith('.zip') ? '.zip' : '.tar.gz'
  const path = getNodePath()
  const extractedDir =
    cacheDir ?? path.join(getSocketDlxDir(), 'trivy', version, platformArch)
  const archive = await downloadAndExtractTool({
    url,
    name: `trivy-${version}-${platformArch}${archiveExt}`,
    integrity,
    extractedDir,
    downloader,
  })
  const nodeProcess = getNodeProcess()
  const binary = nodeProcess.platform === 'win32' ? 'trivy.exe' : 'trivy'
  return {
    path: path.join(extractedDir, binary),
    source: 'download',
    integrity: archive.integrity,
  }
}
