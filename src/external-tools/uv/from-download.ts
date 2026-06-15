/**
 * @file `uvFromDownload()` — fetches upstream uv and returns a `ResolvedUv`
 *   pointing at the extracted binary. uv tarballs wrap the binary in a
 *   `<asset-stem>/` directory; the extractor strips that level so the binary
 *   sits at the cache-dir root.
 */

import path from 'node:path'
import process from 'node:process'

import { getSocketDlxDir } from '../../paths/socket'
import { downloadAndExtractTool } from '../from-download'

import { getUvAssetEntry, getUvDownloadUrl } from './asset-names'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { ResolvedUv } from './types'

export interface UvFromDownloadOptions {
  version: string
  platformArch: string
  integrity?: HashSpec | undefined
  cacheDir?: string | undefined
  downloader?: BinaryDownloader | undefined
}

export async function uvFromDownload(
  options: UvFromDownloadOptions,
): Promise<ResolvedUv | undefined> {
  const { cacheDir, downloader, integrity, platformArch, version } = {
    __proto__: null,
    ...options,
  } as typeof options
  const url = getUvDownloadUrl({ version, platformArch })
  const entry = getUvAssetEntry(platformArch)
  if (!url || !entry) {
    return undefined
  }
  const archiveExt = entry.asset.endsWith('.zip') ? '.zip' : '.tar.gz'
  const extractedDir =
    cacheDir ?? path.join(getSocketDlxDir(), 'uv', version, platformArch)
  // strip:1 unwraps the upstream `<triple>/` directory so `uv[.exe]`
  // lands at extractedDir root.
  const archive = await downloadAndExtractTool({
    url,
    name: `uv-${version}-${platformArch}${archiveExt}`,
    integrity,
    extractedDir,
    extractOptions: { strip: 1 },
    downloader,
  })
  const binary = process.platform === 'win32' ? 'uv.exe' : 'uv'
  return {
    path: path.join(extractedDir, binary),
    source: 'download',
    integrity: archive.integrity,
  }
}
