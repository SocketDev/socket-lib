import { describe, expect, test } from 'vitest'

import {
  getUvAssetEntry,
  getUvDownloadUrl,
  UV_ASSET_MAP,
} from '../../../../src/external-tools/uv/asset-names'

describe('external-tools/uv/asset-names', () => {
  test('covers darwin/linux (gnu+musl) and win on both arm64 and x64', () => {
    expect(Object.keys(UV_ASSET_MAP).sort()).toEqual([
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64',
      'linux-arm64-musl',
      'linux-x64',
      'linux-x64-musl',
      'win-arm64',
      'win-x64',
    ])
  })

  test('uses Rust-target triples for asset names', () => {
    expect(getUvAssetEntry('darwin-arm64')!.asset).toBe(
      'uv-aarch64-apple-darwin.tar.gz',
    )
    expect(getUvAssetEntry('darwin-x64')!.asset).toBe(
      'uv-x86_64-apple-darwin.tar.gz',
    )
    expect(getUvAssetEntry('linux-arm64')!.asset).toBe(
      'uv-aarch64-unknown-linux-gnu.tar.gz',
    )
    expect(getUvAssetEntry('linux-arm64-musl')!.asset).toBe(
      'uv-aarch64-unknown-linux-musl.tar.gz',
    )
    expect(getUvAssetEntry('linux-x64')!.asset).toBe(
      'uv-x86_64-unknown-linux-gnu.tar.gz',
    )
    expect(getUvAssetEntry('linux-x64-musl')!.asset).toBe(
      'uv-x86_64-unknown-linux-musl.tar.gz',
    )
    expect(getUvAssetEntry('win-arm64')!.asset).toBe(
      'uv-aarch64-pc-windows-msvc.zip',
    )
    expect(getUvAssetEntry('win-x64')!.asset).toBe(
      'uv-x86_64-pc-windows-msvc.zip',
    )
  })

  test('windows variants ship as .zip; others as .tar.gz', () => {
    expect(getUvAssetEntry('win-x64')!.asset.endsWith('.zip')).toBe(true)
    expect(getUvAssetEntry('win-arm64')!.asset.endsWith('.zip')).toBe(true)
    expect(getUvAssetEntry('linux-x64')!.asset.endsWith('.tar.gz')).toBe(true)
    expect(getUvAssetEntry('darwin-arm64')!.asset.endsWith('.tar.gz')).toBe(true)
  })

  test('returns undefined for unsupported platforms', () => {
    expect(getUvAssetEntry('freebsd-x64')).toBeUndefined()
    expect(getUvAssetEntry('netbsd-arm64')).toBeUndefined()
  })

  test('getUvDownloadUrl uses BARE semver (no v prefix) — astral-sh/uv convention', () => {
    expect(
      getUvDownloadUrl({ platformArch: 'linux-x64', version: '0.10.11' }),
    ).toBe(
      'https://github.com/astral-sh/uv/releases/download/0.10.11/uv-x86_64-unknown-linux-gnu.tar.gz',
    )
  })

  test('getUvDownloadUrl returns undefined for unsupported platforms', () => {
    expect(
      getUvDownloadUrl({ platformArch: 'freebsd-x64', version: '0.10.11' }),
    ).toBeUndefined()
  })

  test('getUvDownloadUrl URL does NOT include a v prefix on the tag', () => {
    const url = getUvDownloadUrl({
      platformArch: 'darwin-arm64',
      version: '0.10.11',
    })!
    expect(url).toContain('/0.10.11/')
    expect(url).not.toContain('/v0.10.11/')
  })
})
