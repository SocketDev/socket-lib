import { describe, expect, test } from 'vitest'

import {
  TRIVY_ASSET_MAP,
  getTrivyAssetEntry,
  getTrivyDownloadUrl,
} from '../../../../src/external-tools/trivy/asset-names'

describe('external-tools/trivy/asset-names', () => {
  test('covers darwin/linux/win-x64', () => {
    expect(Object.keys(TRIVY_ASSET_MAP).toSorted()).toEqual([
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64',
      'linux-x64',
      'win-x64',
    ])
  })

  test('macOS uses macOS-* tarballs', () => {
    expect(getTrivyAssetEntry('darwin-arm64')!.suffix).toBe(
      'macOS-ARM64.tar.gz',
    )
    expect(getTrivyAssetEntry('darwin-x64')!.suffix).toBe('macOS-64bit.tar.gz')
  })

  test('Linux uses Linux-* tarballs', () => {
    expect(getTrivyAssetEntry('linux-arm64')!.suffix).toBe('Linux-ARM64.tar.gz')
    expect(getTrivyAssetEntry('linux-x64')!.suffix).toBe('Linux-64bit.tar.gz')
  })

  test('Windows uses a zip archive', () => {
    expect(getTrivyAssetEntry('win-x64')!.suffix).toBe('windows-64bit.zip')
  })

  test('returns undefined for unsupported platforms', () => {
    expect(getTrivyAssetEntry('win-arm64')).toBeUndefined()
    expect(getTrivyAssetEntry('linux-arm64-musl')).toBeUndefined()
    expect(getTrivyAssetEntry('freebsd-x64')).toBeUndefined()
  })

  test('getTrivyDownloadUrl interpolates version into both the tag AND the asset name', () => {
    expect(
      getTrivyDownloadUrl({ platformArch: 'linux-x64', version: '0.69.3' }),
    ).toBe(
      'https://github.com/aquasecurity/trivy/releases/download/v0.69.3/trivy_0.69.3_Linux-64bit.tar.gz',
    )
  })

  test('getTrivyDownloadUrl returns undefined for an unsupported platform', () => {
    expect(
      getTrivyDownloadUrl({ platformArch: 'win-arm64', version: '0.69.3' }),
    ).toBeUndefined()
  })

  test('getTrivyDownloadUrl builds the right URL for windows', () => {
    expect(
      getTrivyDownloadUrl({ platformArch: 'win-x64', version: '0.69.3' }),
    ).toBe(
      'https://github.com/aquasecurity/trivy/releases/download/v0.69.3/trivy_0.69.3_windows-64bit.zip',
    )
  })
})
