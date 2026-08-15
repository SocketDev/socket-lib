import { describe, expect, test } from 'vitest'

import { cacheKey } from '../../../../src/external-tools/cdxgen/resolve.mjs'
import { makeHash } from '../../../../src/crypto/integrity.mjs'

describe('external-tools/cdxgen/resolve — cacheKey', () => {
  test('returns "local-only" when no opts are given', () => {
    expect(cacheKey(undefined)).toBe('local-only')
  })

  test('returns "local-only" when opts has no downloadIfMissing', () => {
    expect(cacheKey({})).toBe('local-only')
  })

  test('defaults variant to slim in the key', () => {
    expect(
      cacheKey({
        downloadIfMissing: { platformArch: 'linux-x64', version: '12.4.1' },
      }),
    ).toBe('dl:12.4.1:linux-x64:slim::')
  })

  test('encodes the explicit full variant', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          variant: 'full',
          version: '12.4.1',
        },
      }),
    ).toBe('dl:12.4.1:linux-x64:full::')
  })

  test('different variants produce different keys', () => {
    const slim = cacheKey({
      downloadIfMissing: { platformArch: 'linux-x64', version: '12.4.1' },
    })
    const full = cacheKey({
      downloadIfMissing: {
        platformArch: 'linux-x64',
        variant: 'full',
        version: '12.4.1',
      },
    })
    expect(slim).not.toBe(full)
  })

  test('encodes a string integrity', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          version: '12.4.1',
          integrity: 'sha256-cdx',
        },
      }),
    ).toBe('dl:12.4.1:linux-x64:slim:sha256-cdx:')
  })

  test('encodes a Hash object integrity', () => {
    const hash = makeHash('sha256', 'a'.repeat(64))
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          version: '12.4.1',
          integrity: hash,
        },
      }),
    ).toBe(`dl:12.4.1:linux-x64:slim:${hash.sri}:`)
  })

  test('encodes cacheDir', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          platformArch: 'linux-x64',
          version: '12.4.1',
          cacheDir: '/tmp/cdx',
        },
      }),
    ).toBe('dl:12.4.1:linux-x64:slim::/tmp/cdx')
  })
})
