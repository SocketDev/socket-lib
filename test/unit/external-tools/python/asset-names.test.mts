import process from 'node:process'

import { describe, expect, test } from 'vitest'

import {
  DEFAULT_PYTHON_PIN,
  getPythonArch,
  pythonAsset,
} from '../../../../src/external-tools/python/asset-names'

const SUPPORTED_ARCHES = [
  'darwin-arm64',
  'darwin-x64',
  'linux-arm64',
  'linux-arm64-musl',
  'linux-x64',
  'linux-x64-musl',
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

  test('uses win not win32 (python-build-standalone vocabulary)', () => {
    const arch = getPythonArch()
    if (arch !== undefined) {
      expect(arch.startsWith('win32-')).toBe(false)
    }
  })

  test('only carries a -musl suffix on linux', () => {
    const arch = getPythonArch()
    if (arch?.endsWith('-musl')) {
      expect(arch.startsWith('linux-')).toBe(true)
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
    expect(pythonAsset({ ...pin, arch: 'darwin-arm64' })!.assetName).toBe(
      'cpython-3.11.14+20260203-aarch64-apple-darwin-install_only.tar.gz',
    )
    expect(pythonAsset({ ...pin, arch: 'linux-x64' })!.assetName).toBe(
      'cpython-3.11.14+20260203-x86_64-unknown-linux-gnu-install_only.tar.gz',
    )
    expect(pythonAsset({ ...pin, arch: 'win-x64' })!.assetName).toBe(
      'cpython-3.11.14+20260203-x86_64-pc-windows-msvc-install_only.tar.gz',
    )
  })

  test('maps musl arches to the real musl triple (not a glibc fallback)', () => {
    expect(pythonAsset({ ...pin, arch: 'linux-x64-musl' })!.assetName).toBe(
      'cpython-3.11.14+20260203-x86_64-unknown-linux-musl-install_only.tar.gz',
    )
    expect(pythonAsset({ ...pin, arch: 'linux-arm64-musl' })!.assetName).toBe(
      'cpython-3.11.14+20260203-aarch64-unknown-linux-musl-install_only.tar.gz',
    )
  })

  test('percent-encodes the + between version and tag in the URL', () => {
    const { url } = pythonAsset({ ...pin, arch: 'darwin-arm64' })!
    expect(url).toContain('cpython-3.11.14%2B20260203-')
    expect(url).not.toContain('cpython-3.11.14+20260203-')
    expect(
      url.startsWith(
        'https://github.com/astral-sh/python-build-standalone/releases/download/20260203/',
      ),
    ).toBe(true)
  })

  test('maps every supported platform-arch to a triple', () => {
    for (let i = 0, { length } = SUPPORTED_ARCHES; i < length; i += 1) {
      expect(pythonAsset({ ...pin, arch: SUPPORTED_ARCHES[i]! })).toBeTruthy()
    }
  })

  test('returns undefined for an unsupported platform-arch', () => {
    expect(pythonAsset({ ...pin, arch: 'sunos-sparc' })).toBeUndefined()
  })
})

describe('external-tools/python/asset-names — DEFAULT_PYTHON_PIN', () => {
  test('every supported arch asset name has a checksum entry', () => {
    const { tag, version } = DEFAULT_PYTHON_PIN
    const checksums = DEFAULT_PYTHON_PIN.checksums as unknown as Record<
      string,
      string
    >
    for (let i = 0, { length } = SUPPORTED_ARCHES; i < length; i += 1) {
      const asset = pythonAsset({ arch: SUPPORTED_ARCHES[i]!, tag, version })!
      expect(checksums[asset.assetName]).toMatch(/^[a-f0-9]{64}$/)
    }
  })

  test('has no orphan checksum keys (8 assets, all reachable)', () => {
    const { tag, version } = DEFAULT_PYTHON_PIN
    const reachable = new Set(
      SUPPORTED_ARCHES.map(
        arch => pythonAsset({ arch, tag, version })!.assetName,
      ),
    )
    const keys = Object.keys(DEFAULT_PYTHON_PIN.checksums)
    expect(keys).toHaveLength(SUPPORTED_ARCHES.length)
    for (let i = 0, { length } = keys; i < length; i += 1) {
      expect(reachable.has(keys[i]!)).toBe(true)
    }
  })
})
