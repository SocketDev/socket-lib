import { describe, expect, test } from 'vitest'

import { cacheKey } from '../../../../src/external-tools/jre/resolve'

describe.sequential('external-tools/jre/resolve — cacheKey', () => {
  test('returns "local-only" when no opts are given', () => {
    expect(cacheKey(undefined)).toBe('local-only')
  })

  test('returns "local-only" when opts has no downloadIfMissing', () => {
    expect(cacheKey({})).toBe('local-only')
  })

  test('returns a download-shaped key', () => {
    expect(
      cacheKey({
        downloadIfMissing: { version: 17, platformArch: 'linux-x64' },
      }),
    ).toBe('dl:17:linux-x64::')
  })

  test('encodes a string integrity into the key', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          version: 17,
          platformArch: 'linux-x64',
          integrity: 'sha256-jdk',
        },
      }),
    ).toBe('dl:17:linux-x64:sha256-jdk:')
  })

  test('encodes a structured integrity into the key', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          version: 17,
          platformArch: 'linux-x64',
          integrity: { type: 'checksum', value: 'jdk-val' },
        },
      }),
    ).toBe('dl:17:linux-x64:checksum:jdk-val:')
  })

  test('encodes cacheDir into the key', () => {
    expect(
      cacheKey({
        downloadIfMissing: {
          version: 17,
          platformArch: 'linux-x64',
          cacheDir: '/tmp/jdk-cache',
        },
      }),
    ).toBe('dl:17:linux-x64::/tmp/jdk-cache')
  })

  test('different versions produce different keys', () => {
    const v17 = cacheKey({
      downloadIfMissing: { version: 17, platformArch: 'linux-x64' },
    })
    const v21 = cacheKey({
      downloadIfMissing: { version: 21, platformArch: 'linux-x64' },
    })
    expect(v17).not.toBe(v21)
  })

  test('different platform-archs produce different keys', () => {
    const linux = cacheKey({
      downloadIfMissing: { version: 17, platformArch: 'linux-x64' },
    })
    const mac = cacheKey({
      downloadIfMissing: { version: 17, platformArch: 'darwin-arm64' },
    })
    expect(linux).not.toBe(mac)
  })
})
