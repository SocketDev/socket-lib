import { describe, expect, test } from 'vitest'

import {
  buildCdxgenAssetName,
  CDXGEN_FULL_ASSET_MAP,
  CDXGEN_SLIM_ASSET_MAP,
  getCdxgenAssetEntry,
  getCdxgenDownloadUrl,
  makeCdxgenEntry,
  makeCdxgenPlatformMap,
} from '../../../../src/external-tools/cdxgen/asset-names'

const PLATFORMS = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-arm64-musl',
  'linux-x64',
  'linux-x64-musl',
  'win-arm64',
  'win-x64',
] as const

describe('external-tools/cdxgen/asset-names — buildCdxgenAssetName', () => {
  test('slim variant appends -slim suffix', () => {
    expect(buildCdxgenAssetName('linux-amd64', 'slim', '')).toBe(
      'cdxgen-linux-amd64-slim',
    )
  })

  test('full variant has no -slim suffix', () => {
    expect(buildCdxgenAssetName('linux-amd64', 'full', '')).toBe(
      'cdxgen-linux-amd64',
    )
  })

  test('appends .exe for windows', () => {
    expect(buildCdxgenAssetName('windows-amd64', 'slim', '.exe')).toBe(
      'cdxgen-windows-amd64-slim.exe',
    )
  })

  test('full + .exe on windows', () => {
    expect(buildCdxgenAssetName('windows-amd64', 'full', '.exe')).toBe(
      'cdxgen-windows-amd64.exe',
    )
  })
})

describe('external-tools/cdxgen/asset-names — maps', () => {
  test('SLIM and FULL maps cover the same 8 platform-archs', () => {
    expect(Object.keys(CDXGEN_SLIM_ASSET_MAP).sort()).toEqual([...PLATFORMS])
    expect(Object.keys(CDXGEN_FULL_ASSET_MAP).sort()).toEqual([...PLATFORMS])
  })

  test('SLIM map uses -slim asset names', () => {
    expect(CDXGEN_SLIM_ASSET_MAP['linux-x64']!.asset).toBe(
      'cdxgen-linux-amd64-slim',
    )
    expect(CDXGEN_SLIM_ASSET_MAP['darwin-arm64']!.asset).toBe(
      'cdxgen-darwin-arm64-slim',
    )
  })

  test('FULL map omits the -slim suffix', () => {
    expect(CDXGEN_FULL_ASSET_MAP['linux-x64']!.asset).toBe('cdxgen-linux-amd64')
    expect(CDXGEN_FULL_ASSET_MAP['darwin-arm64']!.asset).toBe(
      'cdxgen-darwin-arm64',
    )
  })

  test('windows assets get .exe in both maps', () => {
    expect(CDXGEN_SLIM_ASSET_MAP['win-x64']!.asset).toBe(
      'cdxgen-windows-amd64-slim.exe',
    )
    expect(CDXGEN_FULL_ASSET_MAP['win-x64']!.asset).toBe(
      'cdxgen-windows-amd64.exe',
    )
  })

  test('linux musl variants carry the -musl base triple', () => {
    expect(CDXGEN_SLIM_ASSET_MAP['linux-x64-musl']!.asset).toBe(
      'cdxgen-linux-amd64-musl-slim',
    )
    expect(CDXGEN_FULL_ASSET_MAP['linux-x64-musl']!.asset).toBe(
      'cdxgen-linux-amd64-musl',
    )
  })

  test('darwin keeps arm64 / x64 base triple as-is, with the amd64 rename for x64', () => {
    expect(CDXGEN_SLIM_ASSET_MAP['darwin-x64']!.asset).toBe(
      'cdxgen-darwin-amd64-slim',
    )
  })
})

describe('external-tools/cdxgen/asset-names — getCdxgenAssetEntry', () => {
  test('defaults to slim when variant is not specified', () => {
    const entry = getCdxgenAssetEntry('linux-x64')!
    expect(entry.asset).toContain('-slim')
  })

  test('returns full variant when requested', () => {
    const entry = getCdxgenAssetEntry('linux-x64', 'full')!
    expect(entry.asset).not.toContain('-slim')
    expect(entry.asset).toBe('cdxgen-linux-amd64')
  })

  test('returns undefined for unsupported platform', () => {
    expect(getCdxgenAssetEntry('freebsd-x64')).toBeUndefined()
    expect(getCdxgenAssetEntry('freebsd-x64', 'full')).toBeUndefined()
  })
})

describe('external-tools/cdxgen/asset-names — getCdxgenDownloadUrl', () => {
  test('builds the v-prefixed release URL for the slim variant by default', () => {
    expect(
      getCdxgenDownloadUrl({ platformArch: 'linux-x64', version: '12.4.1' }),
    ).toBe(
      'https://github.com/CycloneDX/cdxgen/releases/download/v12.4.1/cdxgen-linux-amd64-slim',
    )
  })

  test('uses the full variant when requested', () => {
    expect(
      getCdxgenDownloadUrl({
        platformArch: 'linux-x64',
        variant: 'full',
        version: '12.4.1',
      }),
    ).toBe(
      'https://github.com/CycloneDX/cdxgen/releases/download/v12.4.1/cdxgen-linux-amd64',
    )
  })

  test('returns undefined when platform is unsupported', () => {
    expect(
      getCdxgenDownloadUrl({ platformArch: 'freebsd-x64', version: '12.4.1' }),
    ).toBeUndefined()
  })

  test('handles win-x64 with .exe suffix', () => {
    expect(
      getCdxgenDownloadUrl({ platformArch: 'win-x64', version: '12.4.1' }),
    ).toBe(
      'https://github.com/CycloneDX/cdxgen/releases/download/v12.4.1/cdxgen-windows-amd64-slim.exe',
    )
  })
})

describe('external-tools/cdxgen/asset-names — makeCdxgenEntry / makeCdxgenPlatformMap', () => {
  test('makeCdxgenEntry returns a frozen entry with the built asset name', () => {
    const entry = makeCdxgenEntry('custom-target', 'slim', '')
    expect(entry.asset).toBe('cdxgen-custom-target-slim')
    expect(Object.isFrozen(entry)).toBe(true)
  })

  test('makeCdxgenPlatformMap returns a frozen map for either variant', () => {
    const slim = makeCdxgenPlatformMap('slim')
    expect(Object.isFrozen(slim)).toBe(true)
    expect(Object.keys(slim).sort()).toEqual([...PLATFORMS])
  })
})
