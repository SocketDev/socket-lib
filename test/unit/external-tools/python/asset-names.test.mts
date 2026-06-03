import { describe, expect, test } from 'vitest'

import { pythonAsset } from '../../../../src/external-tools/python/asset-names'

describe('external-tools/python/asset-names — pythonAsset', () => {
  const pin = { version: '3.11.14', tag: '20260203' }

  test('builds the install_only asset name with the platform triple', () => {
    expect(
      pythonAsset({ ...pin, platformArch: 'darwin-arm64' })!.assetName,
    ).toBe('cpython-3.11.14+20260203-aarch64-apple-darwin-install_only.tar.gz')
    expect(pythonAsset({ ...pin, platformArch: 'linux-x64' })!.assetName).toBe(
      'cpython-3.11.14+20260203-x86_64-unknown-linux-gnu-install_only.tar.gz',
    )
    expect(pythonAsset({ ...pin, platformArch: 'win-x64' })!.assetName).toBe(
      'cpython-3.11.14+20260203-x86_64-pc-windows-msvc-install_only.tar.gz',
    )
  })

  test('percent-encodes the + between version and tag in the URL', () => {
    const { url } = pythonAsset({ ...pin, platformArch: 'darwin-arm64' })!
    expect(url).toContain('cpython-3.11.14%2B20260203-')
    expect(url).not.toContain('cpython-3.11.14+20260203-')
    expect(url.startsWith(
      'https://github.com/astral-sh/python-build-standalone/releases/download/20260203/',
    )).toBe(true)
  })

  test('maps every supported platform-arch to a triple', () => {
    for (const pa of [
      'darwin-arm64',
      'darwin-x64',
      'linux-arm64',
      'linux-x64',
      'win-arm64',
      'win-x64',
    ]) {
      expect(pythonAsset({ ...pin, platformArch: pa })).toBeTruthy()
    }
  })

  test('returns undefined for an unsupported platform-arch', () => {
    expect(pythonAsset({ ...pin, platformArch: 'sunos-sparc' })).toBeUndefined()
  })
})
