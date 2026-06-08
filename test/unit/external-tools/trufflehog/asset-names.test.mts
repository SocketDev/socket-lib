import { describe, expect, test } from 'vitest'

import {
  getTrufflehogAssetEntry,
  getTrufflehogDownloadUrl,
  TRUFFLEHOG_ASSET_MAP,
} from '../../../../src/external-tools/trufflehog/asset-names'

describe('external-tools/trufflehog/asset-names', () => {
  test('covers darwin/linux/windows on both arm64 and x64', () => {
    expect(Object.keys(TRUFFLEHOG_ASSET_MAP).toSorted()).toEqual([
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64',
      'linux-x64',
      'win-arm64',
      'win-x64',
    ])
  })

  test('uses Go-style suffix naming (os_arch.tar.gz)', () => {
    expect(getTrufflehogAssetEntry('darwin-arm64')!.suffix).toBe(
      'darwin_arm64.tar.gz',
    )
    expect(getTrufflehogAssetEntry('darwin-x64')!.suffix).toBe(
      'darwin_amd64.tar.gz',
    )
    expect(getTrufflehogAssetEntry('linux-arm64')!.suffix).toBe(
      'linux_arm64.tar.gz',
    )
    expect(getTrufflehogAssetEntry('linux-x64')!.suffix).toBe(
      'linux_amd64.tar.gz',
    )
    expect(getTrufflehogAssetEntry('win-arm64')!.suffix).toBe(
      'windows_arm64.tar.gz',
    )
    expect(getTrufflehogAssetEntry('win-x64')!.suffix).toBe(
      'windows_amd64.tar.gz',
    )
  })

  test('returns undefined for unsupported platforms', () => {
    expect(getTrufflehogAssetEntry('linux-arm64-musl')).toBeUndefined()
    expect(getTrufflehogAssetEntry('linux-x64-musl')).toBeUndefined()
    expect(getTrufflehogAssetEntry('freebsd-x64')).toBeUndefined()
  })

  test('getTrufflehogDownloadUrl interpolates version into tag AND asset name', () => {
    expect(
      getTrufflehogDownloadUrl({
        platformArch: 'linux-x64',
        version: '3.93.8',
      }),
    ).toBe(
      'https://github.com/trufflesecurity/trufflehog/releases/download/v3.93.8/trufflehog_3.93.8_linux_amd64.tar.gz',
    )
  })

  test('getTrufflehogDownloadUrl returns undefined for unsupported platform', () => {
    expect(
      getTrufflehogDownloadUrl({
        platformArch: 'linux-arm64-musl',
        version: '3.93.8',
      }),
    ).toBeUndefined()
  })
})
