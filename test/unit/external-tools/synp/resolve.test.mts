import { describe, expect, test } from 'vitest'

import { cacheKey } from '../../../../src/external-tools/synp/resolve'

describe('external-tools/synp/resolve — cacheKey', () => {
  test('returns "local-only" when no opts are given', () => {
    expect(cacheKey(undefined)).toBe('local-only')
  })

  test('returns "local-only" when opts has no downloadIfMissing', () => {
    expect(cacheKey({})).toBe('local-only')
  })

  test('returns a download-shaped key without integrity', () => {
    expect(
      cacheKey({
        downloadIfMissing: { version: '1.9.14' },
      }),
    ).toBe('dl:1.9.14:')
  })

  test('encodes integrity when provided', () => {
    expect(
      cacheKey({
        downloadIfMissing: { version: '1.9.14', integrity: 'sha256-synp' },
      }),
    ).toBe('dl:1.9.14:sha256-synp')
  })
})
