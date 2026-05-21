import { describe, expect, test } from 'vitest'

import {
  getJanusAssetEntry,
  getJanusDownloadUrl,
  JANUS_ASSET_MAP,
} from '../../../../src/external-tools/janus/asset-names'

describe('external-tools/janus/asset-names', () => {
  test('JANUS_ASSET_MAP currently maps darwin-arm64 only', () => {
    expect(Object.keys(JANUS_ASSET_MAP).sort()).toEqual(['darwin-arm64'])
  })

  test('darwin-arm64 asset entry uses the aarch64-apple-darwin tarball', () => {
    expect(JANUS_ASSET_MAP['darwin-arm64']!.asset).toBe(
      'janus-aarch64-apple-darwin.tar.gz',
    )
  })

  test('getJanusAssetEntry returns undefined for unsupported platforms', () => {
    expect(getJanusAssetEntry('linux-x64')).toBeUndefined()
    expect(getJanusAssetEntry('win-x64')).toBeUndefined()
    expect(getJanusAssetEntry('darwin-x64')).toBeUndefined()
  })

  test('getJanusAssetEntry returns undefined for empty / nonsense input', () => {
    expect(getJanusAssetEntry('')).toBeUndefined()
    expect(getJanusAssetEntry('definitely-not-a-platform')).toBeUndefined()
  })

  test('getJanusDownloadUrl returns the v-prefixed release URL for supported platform', () => {
    expect(
      getJanusDownloadUrl({ platformArch: 'darwin-arm64', version: '1.22.0' }),
    ).toBe(
      'https://github.com/divmain/janus/releases/download/v1.22.0/janus-aarch64-apple-darwin.tar.gz',
    )
  })

  test('getJanusDownloadUrl returns undefined when the platform is not shipped', () => {
    expect(
      getJanusDownloadUrl({ platformArch: 'linux-x64', version: '1.22.0' }),
    ).toBeUndefined()
  })

  test('getJanusDownloadUrl interpolates any version string verbatim', () => {
    expect(
      getJanusDownloadUrl({
        platformArch: 'darwin-arm64',
        version: '0.0.1-rc.5',
      }),
    ).toBe(
      'https://github.com/divmain/janus/releases/download/v0.0.1-rc.5/janus-aarch64-apple-darwin.tar.gz',
    )
  })
})
