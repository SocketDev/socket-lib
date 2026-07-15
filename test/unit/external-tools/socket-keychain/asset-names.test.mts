import { describe, expect, it } from 'vitest'

import {
  getSocketKeychainAssetEntry,
  getSocketKeychainDownloadUrl,
  SOCKET_KEYCHAIN_SUPPORTED_PLATFORM_ARCHES,
} from '../../../../src/external-tools/socket-keychain/asset-names'

describe('external-tools/socket-keychain/asset-names', () => {
  it('covers the release matrix', () => {
    expect(SOCKET_KEYCHAIN_SUPPORTED_PLATFORM_ARCHES).toEqual([
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64',
      'linux-x64',
      'win32-x64',
    ])
  })

  it('builds the exact versioned GitHub asset URL', () => {
    expect(
      getSocketKeychainDownloadUrl({
        platformArch: 'darwin-arm64',
        version: '1.2.3',
      }),
    ).toBe(
      'https://github.com/SocketDev/socket-btm/releases/download/socket-keychain-v1.2.3/socket-keychain-1.2.3-darwin-arm64',
    )
  })

  it('uses an exe suffix only for Windows', () => {
    expect(getSocketKeychainAssetEntry('linux-x64', '1.2.3')?.binary).toBe(
      'socket-keychain',
    )
    expect(getSocketKeychainAssetEntry('win32-x64', '1.2.3')).toEqual({
      asset: 'socket-keychain-1.2.3-win32-x64.exe',
      binary: 'socket-keychain.exe',
    })
  })

  it('returns undefined for unsupported targets', () => {
    expect(getSocketKeychainAssetEntry('win32-arm64', '1.2.3')).toBeUndefined()
  })
})
