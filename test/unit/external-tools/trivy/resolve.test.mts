import { describe, expect, test } from 'vitest'

import { cacheKey } from '../../../../src/external-tools/trivy/resolve'

describe('external-tools/trivy/resolve — cacheKey', () => {
  test('returns "local-only" when no opts are given', () => {
    expect(cacheKey(undefined)).toBe('local-only')
  })

  test('returns "local-only" when opts has no downloadIfMissing', () => {
    expect(cacheKey({})).toBe('local-only')
  })

  test('returns a download-shaped key', () => {
    expect(
      cacheKey({
        downloadIfMissing: { platformArch: 'linux-x64', version: '0.69.3' },
      }),
    ).toBe('dl:0.69.3:linux-x64::')
  })

  test('encodes a string integrity', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          version: '0.69.3',
          integrity: 'sha256-abc',
        },
      }),
    ).toBe('dl:0.69.3:linux-x64:sha256-abc:')
  })

  test('encodes a structured integrity', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          version: '0.69.3',
          integrity: { type: 'checksum', value: 'abc' },
        },
      }),
    ).toBe('dl:0.69.3:linux-x64:checksum:abc:')
  })

  test('encodes cacheDir', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          version: '0.69.3',
          cacheDir: '/tmp/tr',
        },
      }),
    ).toBe('dl:0.69.3:linux-x64::/tmp/tr')
  })
})
