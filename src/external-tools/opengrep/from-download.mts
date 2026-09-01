/**
 * @file `opengrepFromDownload()` — fetches upstream OpenGrep and returns a
 *   `ResolvedOpengrep` pointing at the cached binary. macOS/Linux assets are
 *   bare binaries needing no extraction; Windows ships a zip. The asset-map's
 *   `isArchive` flag drives extraction vs. copy.
 */

import { getSocketDlxDir } from '../../paths/socket.mjs'
import { safeMkdir } from '../../fs/safe.mjs'
import {
  downloadAndExtractTool,
  downloadToolArchive,
} from '../from-download.mjs'

import {
  getOpengrepAssetEntry,
  getOpengrepDownloadUrl,
} from './asset-names.mjs'

import type { BinaryDownloader } from '../from-download.mjs'
import type { HashInput } from '../../crypto/integrity.mjs'
import type { ResolvedOpengrep } from './types.mjs'
import { getNodeFs } from '../../node/fs.mjs'
import { getNodePath } from '../../node/path.mjs'

export interface OpengrepFromDownloadOptions {
  version: string
  platformArch: string
  integrity?: HashInput | undefined
  cacheDir?: string | undefined
  downloader?: BinaryDownloader | undefined
}

export async function opengrepFromDownload(
  options: OpengrepFromDownloadOptions,
): Promise<ResolvedOpengrep | undefined> {
  const { cacheDir, downloader, integrity, platformArch, version } = {
    __proto__: null,
    ...options,
  } as typeof options
  const url = getOpengrepDownloadUrl({ version, platformArch })
  const entry = getOpengrepAssetEntry(platformArch)
  if (!url || !entry) {
    return undefined
  }
  const path = getNodePath()
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
  const fs = getNodeFs()
  await fs.promises.copyFile(archive.archivePath, finalPath)
  await fs.promises.chmod(finalPath, 0o755)
  return {
    path: finalPath,
    source: 'download',
    integrity: archive.integrity,
  }
}
