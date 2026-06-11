/**
 * @file `opengrepFromDownload()` — fetches upstream OpenGrep and returns a
 *   `ResolvedOpengrep` pointing at the cached binary. macOS/Linux assets are
 *   bare binaries (no extraction); Windows ships a zip. The asset-map's
 *   `isArchive` flag drives extraction vs. copy.
 */

import path from 'node:path'
import { promises as fsPromises } from 'node:fs'

import { getSocketDlxDir } from '../../paths/socket'
import { safeMkdir } from '../../fs/safe'
import { downloadAndExtractTool, downloadToolArchive } from '../from-download'

import { getOpengrepAssetEntry, getOpengrepDownloadUrl } from './asset-names'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { ResolvedOpengrep } from './types'

export interface OpengrepFromDownloadOptions {
  version: string
  platformArch: string
  integrity?: HashSpec | undefined
  cacheDir?: string | undefined
  downloader?: BinaryDownloader | undefined
}

export async function opengrepFromDownload(
  opts: OpengrepFromDownloadOptions,
): Promise<ResolvedOpengrep | undefined> {
  const { cacheDir, downloader, integrity, platformArch, version } = {
    __proto__: null,
    ...opts,
  } as typeof opts
  const url = getOpengrepDownloadUrl({ version, platformArch })
  const entry = getOpengrepAssetEntry(platformArch)
  if (!url || !entry) {
    return undefined
  }
  const targetDir =
    cacheDir ?? path.join(getSocketDlxDir(), 'opengrep', version, platformArch)

  if (entry.isArchive) {
    const archive = await downloadAndExtractTool({
      url,
      name: `opengrep-${version}-${platformArch}-${entry.asset}`,
      integrity,
      extractedDir: targetDir,
      downloader,
    })
    return {
      path: path.join(targetDir, entry.binaryInArchive!),
      source: 'download',
      integrity: archive.integrity,
    }
  }

  // Bare-binary asset (macOS/Linux): download to dlx cache, then copy
  // into the per-version cacheDir under a normalized `opengrep`
  // filename so callers don't need to know the upstream asset name.
  const archive = await downloadToolArchive({
    url,
    name: `opengrep-${version}-${platformArch}-${entry.asset}`,
    integrity,
    downloader,
  })
  await safeMkdir(targetDir)
  const finalPath = path.join(targetDir, 'opengrep')
  await fsPromises.copyFile(archive.archivePath, finalPath)
  await fsPromises.chmod(finalPath, 0o755)
  return {
    path: finalPath,
    source: 'download',
    integrity: archive.integrity,
  }
}
