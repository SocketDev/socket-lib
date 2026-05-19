/**
 * @file `janusFromDownload()` — fetches upstream janus and returns a
 *   `ResolvedJanus` pointing at the extracted binary. janus ships tar.gz
 *   archives containing a bare `janus` binary at the archive root (no nested
 *   directory). Defaults install under the shared wheelhouse dir
 *   (`~/.socket/_wheelhouse/janus/<version>/<platform-arch>/`) rather than the
 *   per-process dlx cache, so multiple fleet consumers reuse the same extracted
 *   binary.
 */

import path from 'node:path'
import process from 'node:process'

import { getSocketWheelhouseDir } from '../../paths/socket'
import { downloadAndExtractTool } from '../from-download'

import { getJanusDownloadUrl } from './asset-names'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { ResolvedJanus } from './types'

export interface JanusFromDownloadOptions {
  version: string
  platformArch: string
  integrity?: HashSpec | undefined
  /**
   * Override the install directory. By default the binary lands in
   * `<getSocketWheelhouseDir()>/janus/<version>/<platformArch>/` — a shared
   * cross-fleet location so multiple Socket tools resolve the same binary
   * without per-process duplication.
   */
  cacheDir?: string | undefined
  downloader?: BinaryDownloader | undefined
}

export async function janusFromDownload(
  opts: JanusFromDownloadOptions,
): Promise<ResolvedJanus | undefined> {
  const { cacheDir, downloader, integrity, platformArch, version } = opts
  const url = getJanusDownloadUrl({ version, platformArch })
  if (!url) {
    return undefined
  }
  const extractedDir =
    cacheDir ??
    path.join(getSocketWheelhouseDir(), 'janus', version, platformArch)
  const archive = await downloadAndExtractTool({
    url,
    name: `janus-${version}-${platformArch}.tar.gz`,
    integrity,
    extractedDir,
    downloader,
  })
  const binary = process.platform === 'win32' ? 'janus.exe' : 'janus'
  return {
    path: path.join(extractedDir, binary),
    source: 'download',
    integrity: archive.integrity,
  }
}
