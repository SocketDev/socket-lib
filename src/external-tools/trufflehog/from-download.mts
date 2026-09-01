/**
 * @file `trufflehogFromDownload()` — fetches upstream TruffleHog and returns a
 *   `ResolvedTrufflehog` pointing at the extracted binary. TruffleHog ships as
 *   tar.gz archives per platform; the helper extracts and locates the
 *   `trufflehog` (or `trufflehog.exe`) executable. Idempotent: re-running with
 *   the same `{version, platformArch}` after a successful first run is a cache
 *   check, no network. Trust-on-first-use: pass `integrity` from
 *   `external-tools.json` when available.
 */

import { getSocketDlxDir } from '../../paths/socket.mjs'
import { downloadAndExtractTool } from '../from-download.mjs'

import { getTrufflehogDownloadUrl } from './asset-names.mjs'

import type { BinaryDownloader } from '../from-download.mjs'
import type { HashInput } from '../../crypto/integrity.mjs'
import type { ResolvedTrufflehog } from './types.mjs'
import { getNodePath } from '../../node/path.mjs'
import { getNodeProcess } from '../../node/process.mjs'

export interface TrufflehogFromDownloadOptions {
  /**
   * TruffleHog release version, e.g. `'3.93.8'`.
   */
  version: string
  /**
   * Socket platform-arch token, e.g. `'darwin-arm64'`.
   */
  platformArch: string
  /**
   * Optional pinned integrity from `external-tools.json`.
   */
  integrity?: HashInput | undefined
  /**
   * Override the cache directory. By default the binary extracts into
   * `<getSocketDlxDir()>/trufflehog/<version>/<platformArch>/`.
   */
  cacheDir?: string | undefined
  /**
   * Inject a custom downloader. Forwarded to the underlying
   * `downloadAndExtractTool`. Defaults to dlx.
   */
  downloader?: BinaryDownloader | undefined
}

export async function trufflehogFromDownload(
  options: TrufflehogFromDownloadOptions,
): Promise<ResolvedTrufflehog | undefined> {
  const { cacheDir, downloader, integrity, platformArch, version } = {
    __proto__: null,
    ...options,
  } as typeof options
  const url = getTrufflehogDownloadUrl({ version, platformArch })
  if (!url) {
    return undefined
  }
  const path = getNodePath()
  const extractedDir =
    cacheDir ??
    path.join(getSocketDlxDir(), 'trufflehog', version, platformArch)
  const archive = await downloadAndExtractTool({
    url,
    name: `trufflehog-${version}-${platformArch}.tar.gz`,
    integrity,
    extractedDir,
    downloader,
  })
  const nodeProcess = getNodeProcess()
  const binary =
    nodeProcess.platform === 'win32' ? 'trufflehog.exe' : 'trufflehog'
  return {
    path: path.join(extractedDir, binary),
    source: 'download',
    integrity: archive.integrity,
  }
}
