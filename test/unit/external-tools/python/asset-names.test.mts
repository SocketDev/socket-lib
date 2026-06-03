import process from 'node:process'

import { describe, expect, test } from 'vitest'

import {
  getPythonArch,
  pythonAsset,
} from '../../../../src/external-tools/python/asset-names'

const SUPPORTED_ARCHES = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-x64',
  'win-arm64',
  'win-x64',
]

describe('external-tools/python/asset-names — getPythonArch', () => {
  test('returns a supported triple key for the current host (or undefined)', () => {
    const arch = getPythonArch()
    if (arch !== undefined) {
      expect(SUPPORTED_ARCHES).toContain(arch)
    }
  })

  test('never emits a win32 segment or a -musl suffix (python vocabulary)', () => {
    const arch = getPythonArch()
    if (arch !== undefined) {
      expect(arch.startsWith('win32-')).toBe(false)
      expect(arch.endsWith('-musl')).toBe(false)
    }
  })

  test('agrees with the host platform family', () => {
    const arch = getPythonArch()
    if (arch === undefined) {
      return
    }
    if (process.platform === 'win32') {
      expect(arch.startsWith('win-')).toBe(true)
    } else if (process.platform === 'darwin') {
      expect(arch.startsWith('darwin-')).toBe(true)
    } else if (process.platform === 'linux') {
      expect(arch.startsWith('linux-')).toBe(true)
    }
  })
})

describe('external-tools/python/asset-names — pythonAsset', () => {
  const pin = { version: '3.11.14', tag: '20260203' }

  test('falls back to the host arch when arch is omitted', () => {
    // Mirrors getPythonArch(): present-or-undefined, never throws.
    const hostArch = getPythonArch()
    const asset = pythonAsset({ ...pin })
    if (hostArch === undefined) {
      expect(asset).toBeUndefined()
    } else {
      expect(asset!.assetName).toContain('cpython-3.11.14+20260203-')
    }
  })

  test('builds the install_only asset name with the platform triple', () => {
    expect(
      pythonAsset({ ...pin, arch: 'darwin-arm64' })!.assetName,
    ).toBe('cpython-3.11.14+20260203-aarch64-apple-darwin-install_only.tar.gz')
    expect(pythonAsset({ ...pin, arch: 'linux-x64' })!.assetName).toBe(
      'cpython-3.11.14+20260203-x86_64-unknown-linux-gnu-install_only.tar.gz',
    )
    expect(pythonAsset({ ...pin, arch: 'win-x64' })!.assetName).toBe(
      'cpython-3.11.14+20260203-x86_64-pc-windows-msvc-install_only.tar.gz',
    )
  })

  test('percent-encodes the + between version and tag in the URL', () => {
    const { url } = pythonAsset({ ...pin, arch: 'darwin-arm64' })!
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
      expect(pythonAsset({ ...pin, arch: pa })).toBeTruthy()
    }
  })

  test('returns undefined for an unsupported platform-arch', () => {
    expect(pythonAsset({ ...pin, arch: 'sunos-sparc' })).toBeUndefined()
  })
})
