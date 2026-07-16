import { existsSync, readFileSync, statSync } from 'node:fs'
import { mkdtemp } from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { normalizePath } from '@socketsecurity/lib-stable/paths/normalize'

import { safeDelete } from '../../../../src/fs/safe'
import { socketKeychainFromDownload } from '../../../../src/external-tools/socket-keychain/from-download'
import {
  FAKE_INTEGRITY_VALUE,
  makeFakeDownloader,
} from '../../../lib/fake-downloader'

const scratchDirs: string[] = []

afterEach(async () => {
  for (let i = 0, { length } = scratchDirs; i < length; i += 1) {
    await safeDelete(scratchDirs[i]!)
  }
  scratchDirs.length = 0
})

describe('external-tools/socket-keychain/from-download', () => {
  it('downloads the exact asset into an owner-only rack directory', async () => {
    const targetDir = await mkdtemp(
      path.join(os.tmpdir(), 'socket-keychain-test-'),
    )
    scratchDirs.push(targetDir)
    const fake = makeFakeDownloader('native-binary')
    scratchDirs.push(fake.scratchDir)

    const result = await socketKeychainFromDownload({
      cacheDir: targetDir,
      downloader: fake.downloader,
      integrity: FAKE_INTEGRITY_VALUE,
      platformArch: 'darwin-arm64',
      version: '1.2.3',
    })

    expect(result).toEqual({
      integrity: FAKE_INTEGRITY_VALUE,
      path: normalizePath(path.join(targetDir, 'socket-keychain')),
      source: 'download',
    })
    expect(readFileSync(result.path, 'utf8')).toBe('native-binary')
    if (process.platform !== 'win32') {
      expect(statSync(result.path).mode & 0o777).toBe(0o700)
    }
    expect(fake.calls).toEqual([
      {
        name: 'socket-keychain-1.2.3-darwin-arm64',
        url: 'https://github.com/SocketDev/socket-btm/releases/download/socket-keychain-v1.2.3/socket-keychain-1.2.3-darwin-arm64',
      },
    ])
  })

  it('rejects an unsupported target before downloading', async () => {
    const fake = makeFakeDownloader('unused')
    scratchDirs.push(fake.scratchDir)
    await expect(
      socketKeychainFromDownload({
        downloader: fake.downloader,
        integrity: FAKE_INTEGRITY_VALUE,
        platformArch: 'win32-arm64',
        version: '1.2.3',
      }),
    ).rejects.toThrow(/wanted one of darwin-arm64/u)
    expect(fake.calls).toHaveLength(0)
  })

  it('uses the Windows executable name', async () => {
    const targetDir = await mkdtemp(
      path.join(os.tmpdir(), 'socket-keychain-win-test-'),
    )
    scratchDirs.push(targetDir)
    const fake = makeFakeDownloader('windows-binary')
    scratchDirs.push(fake.scratchDir)

    const result = await socketKeychainFromDownload({
      cacheDir: targetDir,
      downloader: fake.downloader,
      integrity: FAKE_INTEGRITY_VALUE,
      platformArch: 'win32-x64',
      version: '1.2.3',
    })
    expect(result.path).toBe(
      normalizePath(path.join(targetDir, 'socket-keychain.exe')),
    )
    expect(existsSync(result.path)).toBe(true)
  })
})
