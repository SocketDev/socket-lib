/**
 * @file Download one exact socket-keychain release asset, verify its pinned
 *   integrity, and copy it into the shared Wheelhouse rack.
 */

import { normalizePath } from '../../paths/normalize.mjs'
import { getSocketRackToolDir } from '../../paths/socket.mjs'
import { ErrorCtor } from '../../primordials/error.mjs'
import { downloadToolArchive } from '../from-download.mjs'
import {
  getSocketKeychainAssetEntry,
  getSocketKeychainDownloadUrl,
  SOCKET_KEYCHAIN_SUPPORTED_PLATFORM_ARCHES,
} from './asset-names.mjs'

import type { HashInput } from '../../crypto/integrity.mjs'
import type { BinaryDownloader } from '../from-download.mjs'
import type { ResolvedSocketKeychain } from './types.mjs'
import { getNodeFs } from '../../node/fs.mjs'
import { getNodePath } from '../../node/path.mjs'

export interface SocketKeychainFromDownloadOptions {
  cacheDir?: string | undefined
  downloader?: BinaryDownloader | undefined
  integrity: HashInput
  platformArch: string
  version: string
}

export async function socketKeychainFromDownload(
  options: SocketKeychainFromDownloadOptions,
): Promise<ResolvedSocketKeychain> {
  const { cacheDir, downloader, integrity, platformArch, version } = {
    __proto__: null,
    ...options,
  } as typeof options
  const entry = getSocketKeychainAssetEntry(platformArch, version)
  const url = getSocketKeychainDownloadUrl({ platformArch, version })
  if (!entry || !url) {
    const supported = SOCKET_KEYCHAIN_SUPPORTED_PLATFORM_ARCHES.join(', ')
    throw new ErrorCtor(
      `socketKeychainFromDownload could not choose a release asset for ${platformArch}: saw an unsupported platform-arch, wanted one of ${supported}; pass a supported platformArch.`,
    )
  }

  const path = getNodePath()
  const targetDir = normalizePath(
    cacheDir ??
      path.join(
        getSocketRackToolDir({ tool: 'socket-keychain', version }),
        platformArch,
      ),
  )
  const downloaded = await downloadToolArchive({
    downloader,
    integrity,
    name: entry.asset,
    url,
  })
  const fs = getNodeFs()
  await fs.promises.mkdir(targetDir, { recursive: true, mode: 0o700 })
  const finalPath = normalizePath(path.join(targetDir, entry.binary))
  await fs.promises.copyFile(downloaded.archivePath, finalPath)
  await fs.promises.chmod(finalPath, 0o700)
  return {
    integrity: downloaded.integrity,
    path: finalPath,
    source: 'download',
  }
}
