import { describe, expect, test } from 'vitest'

import { cacheKey } from '../../../../src/external-tools/trufflehog/resolve'
import { makeHash } from '../../../../src/crypto/integrity'

describe('external-tools/trufflehog/resolve — cacheKey', () => {
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
          version: '3.93.8',
        },
      }),
    ).toBe('dl:3.93.8:linux-x64::')
  })

  test('encodes a string integrity', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          version: '3.93.8',
          integrity: 'sha256-truf',
        },
      }),
    ).toBe('dl:3.93.8:linux-x64:sha256-truf:')
  })

  test('encodes a Hash object integrity', () => {
    const hash = makeHash('sha256', 'a'.repeat(64))
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          version: '3.93.8',
          integrity: hash,
        },
      }),
    ).toBe(`dl:3.93.8:linux-x64:${hash.sri}:`)
  })

  test('encodes cacheDir', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          version: '3.93.8',
          cacheDir: '/tmp/th',
        },
      }),
    ).toBe('dl:3.93.8:linux-x64::/tmp/th')
  })
})
