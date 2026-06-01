import { describe, expect, test } from 'vitest'

import {
  OPENGREP_ASSET_MAP,
  getOpengrepAssetEntry,
  getOpengrepDownloadUrl,
} from '../../../../src/external-tools/opengrep/asset-names'

describe('external-tools/opengrep/asset-names', () => {
  test('covers darwin/linux/win', () => {
    expect(Object.keys(OPENGREP_ASSET_MAP).toSorted()).toEqual([
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64',
      'linux-x64',
      'win-x64',
    ])
  })

  test('flags unix targets as bare binaries (not archives)', () => {
    for (const key of [
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64',
      'linux-x64',
    ]) {
      const entry = getOpengrepAssetEntry(key)!
      expect(entry.isArchive).toBe(false)
      expect(entry.binaryInArchive).toBeUndefined()
    }
  })

  test('flags win-x64 as a zip archive containing opengrep-core.exe', () => {
    const entry = getOpengrepAssetEntry('win-x64')!
    expect(entry.isArchive).toBe(true)
    expect(entry.binaryInArchive).toBe('opengrep-core.exe')
    expect(entry.asset).toBe('opengrep-core_windows_x86.zip')
  })

  test('darwin-arm64 maps to opengrep_osx_arm64', () => {
    expect(getOpengrepAssetEntry('darwin-arm64')!.asset).toBe(
      'opengrep_osx_arm64',
    )
  })

  test('linux-x64 maps to opengrep_manylinux_x86', () => {
    expect(getOpengrepAssetEntry('linux-x64')!.asset).toBe(
      'opengrep_manylinux_x86',
    )
  })

  test('returns undefined for unsupported platforms', () => {
    expect(getOpengrepAssetEntry('linux-arm64-musl')).toBeUndefined()
    expect(getOpengrepAssetEntry('win-arm64')).toBeUndefined()
    expect(getOpengrepAssetEntry('freebsd-x64')).toBeUndefined()
  })

  test('getOpengrepDownloadUrl returns v-prefixed release URL for supported platform', () => {
    expect(
      getOpengrepDownloadUrl({ platformArch: 'linux-x64', version: '1.16.5' }),
    ).toBe(
      'https://github.com/opengrep/opengrep/releases/download/v1.16.5/opengrep_manylinux_x86',
    )
  })

  test('getOpengrepDownloadUrl returns undefined when the platform is not shipped', () => {
    expect(
      getOpengrepDownloadUrl({ platformArch: 'win-arm64', version: '1.16.5' }),
    ).toBeUndefined()
  })

  test('getOpengrepDownloadUrl uses the zip asset name on windows', () => {
    expect(
      getOpengrepDownloadUrl({ platformArch: 'win-x64', version: '1.16.5' }),
    ).toBe(
      'https://github.com/opengrep/opengrep/releases/download/v1.16.5/opengrep-core_windows_x86.zip',
    )
  })
})
