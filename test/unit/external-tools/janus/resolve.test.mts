import { describe, expect, test } from 'vitest'

import { cacheKey } from '../../../../src/external-tools/janus/resolve'

describe('external-tools/janus/resolve — cacheKey', () => {
  test('returns "local-only" when no opts are given', () => {
    expect(cacheKey(undefined)).toBe('local-only')
  })

  test('returns "local-only" when opts has no downloadIfMissing', () => {
    expect(cacheKey({})).toBe('local-only')
  })

  test('returns a download-shaped key when downloadIfMissing is set', () => {
    const key = cacheKey({
      downloadIfMissing: {
        platformArch: 'darwin-arm64',
        version: '1.22.0',
      },
    })
    expect(key).toBe('dl:1.22.0:darwin-arm64::')
  })

  test('encodes a string integrity into the key', () => {
    const key = cacheKey({
      downloadIfMissing: {
        platformArch: 'darwin-arm64',
        version: '1.22.0',
        integrity: 'sha256-abc',
      },
    })
    expect(key).toBe('dl:1.22.0:darwin-arm64:sha256-abc:')
  })

  test('encodes a structured integrity into the key', () => {
    const key = cacheKey({
      downloadIfMissing: {
        platformArch: 'darwin-arm64',
        version: '1.22.0',
        integrity: { type: 'checksum', value: 'deadbeef' },
      },
    })
    expect(key).toBe('dl:1.22.0:darwin-arm64:checksum:deadbeef:')
  })

  test('encodes cacheDir into the key', () => {
    const key = cacheKey({
      downloadIfMissing: {
        platformArch: 'darwin-arm64',
        version: '1.22.0',
        cacheDir: '/tmp/janus-cache',
      },
    })
    expect(key).toBe('dl:1.22.0:darwin-arm64::/tmp/janus-cache')
  })

  test('different option shapes produce different keys', () => {
    const a = cacheKey({
      downloadIfMissing: { platformArch: 'darwin-arm64', version: '1.22.0' },
    })
    const b = cacheKey({
      downloadIfMissing: { platformArch: 'darwin-arm64', version: '1.23.0' },
    })
    const c = cacheKey({
      downloadIfMissing: { platformArch: 'linux-x64', version: '1.22.0' },
    })
    expect(a).not.toBe(b)
    expect(a).not.toBe(c)
    expect(b).not.toBe(c)
  })
})
