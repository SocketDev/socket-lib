import { describe, expect, test } from 'vitest'

import { cacheKey } from '../../../../src/external-tools/opengrep/resolve'

describe('external-tools/opengrep/resolve — cacheKey', () => {
  test('returns "local-only" when no opts are given', () => {
    expect(cacheKey(undefined)).toBe('local-only')
  })

  test('returns "local-only" when opts has no downloadIfMissing', () => {
    expect(cacheKey({})).toBe('local-only')
  })

  test('returns a download-shaped key', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          version: '1.16.5',
        },
      }),
    ).toBe('dl:1.16.5:linux-x64::')
  })

  test('encodes a string integrity into the key', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          version: '1.16.5',
          integrity: 'sha256-xyz',
        },
      }),
    ).toBe('dl:1.16.5:linux-x64:sha256-xyz:')
  })

  test('encodes a structured integrity into the key', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          version: '1.16.5',
          integrity: { type: 'integrity', value: 'sha512-abc' },
        },
      }),
    ).toBe('dl:1.16.5:linux-x64:integrity:sha512-abc:')
  })

  test('encodes cacheDir into the key', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          version: '1.16.5',
          cacheDir: '/tmp/og',
        },
      }),
    ).toBe('dl:1.16.5:linux-x64::/tmp/og')
  })
})
