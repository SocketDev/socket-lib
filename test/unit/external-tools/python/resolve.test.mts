import { describe, expect, test } from 'vitest'

import { cacheKey } from '../../../../src/external-tools/python/resolve'

describe('external-tools/python/resolve — cacheKey', () => {
  test('returns "local-only" when no opts are given', () => {
    expect(cacheKey(undefined)).toBe('local-only')
  })

  test('returns "local-only" when opts has no downloadIfMissing', () => {
    expect(cacheKey({})).toBe('local-only')
  })

  test('prefixes prefer when preferDownload is set', () => {
    expect(cacheKey({ preferDownload: true })).toBe('prefer:local-only')
  })

  test('returns a download-shaped key', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          tag: '20260203',
          version: '3.11.14',
        },
      }),
    ).toBe('dl:3.11.14:20260203:linux-x64::')
  })

  test('encodes a string integrity', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          tag: '20260203',
          version: '3.11.14',
          integrity: 'sha256-py',
        },
      }),
    ).toBe('dl:3.11.14:20260203:linux-x64:sha256-py:')
  })

  test('encodes a structured integrity', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          tag: '20260203',
          version: '3.11.14',
          integrity: { type: 'checksum', value: 'hex-val' },
        },
      }),
    ).toBe('dl:3.11.14:20260203:linux-x64:checksum:hex-val:')
  })

  test('preferDownload + download key combine', () => {
    expect(
      cacheKey({
        preferDownload: true,
        downloadIfMissing: {
          platformArch: 'darwin-arm64',
          tag: '20260203',
          version: '3.11.14',
        },
      }),
    ).toBe('prefer:dl:3.11.14:20260203:darwin-arm64::')
  })
})
