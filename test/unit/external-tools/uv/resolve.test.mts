import { describe, expect, test } from 'vitest'

import { cacheKey } from '../../../../src/external-tools/uv/resolve'
import { makeHash } from '../../../../src/integrity'

describe('external-tools/uv/resolve — cacheKey', () => {
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
          version: '0.10.11',
        },
      }),
    ).toBe('dl:0.10.11:linux-x64::')
  })

  test('encodes a string integrity', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          version: '0.10.11',
          integrity: 'sha256-uv',
        },
      }),
    ).toBe('dl:0.10.11:linux-x64:sha256-uv:')
  })

  test('encodes a Hash object integrity', () => {
    const hash = makeHash('sha512', 'a'.repeat(128))
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          version: '0.10.11',
          integrity: hash,
        },
      }),
    ).toBe(`dl:0.10.11:linux-x64:${hash.sri}:`)
  })

  test('encodes cacheDir', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          version: '0.10.11',
          cacheDir: '/tmp/uv',
        },
      }),
    ).toBe('dl:0.10.11:linux-x64::/tmp/uv')
  })
})
