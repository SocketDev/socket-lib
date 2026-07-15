/**
 * @file Download one exact socket-keychain release asset, verify its pinned
 *   integrity, and copy it into the shared Wheelhouse rack.
 */

import path from 'node:path'
import { promises as fsPromises } from 'node:fs'

import { normalizePath } from '../../paths/normalize'
import { getSocketRackToolDir } from '../../paths/socket'
import { ErrorCtor } from '../../primordials/error'
import { downloadToolArchive } from '../from-download'
import {
  getSocketKeychainAssetEntry,
  getSocketKeychainDownloadUrl,
  SOCKET_KEYCHAIN_SUPPORTED_PLATFORM_ARCHES,
} from './asset-names'

import type { HashSpec } from '../../integrity'
import type { BinaryDownloader } from '../from-download'
import type { ResolvedSocketKeychain } from './types'

export interface SocketKeychainFromDownloadOptions {
  cacheDir?: string | undefined
  downloader?: BinaryDownloader | undefined
  integrity: HashSpec
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
  await fsPromises.mkdir(targetDir, { recursive: true, mode: 0o700 })
  const finalPath = normalizePath(path.join(targetDir, entry.binary))
  await fsPromises.copyFile(downloaded.archivePath, finalPath)
  await fsPromises.chmod(finalPath, 0o700)
  return {
    integrity: downloaded.integrity,
    path: finalPath,
    source: 'download',
  }
}
