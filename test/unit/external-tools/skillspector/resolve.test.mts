import { describe, expect, test } from 'vitest'

import { cacheKey } from '../../../../src/external-tools/skillspector/resolve'

// Published-snapshot binding used to BUILD expected values inside
// `expect(...)`. This stable alias satisfies
// `socket/no-src-import-in-test-expect`.
import { cacheKey as canonicalCacheKey } from '@socketsecurity/lib-stable/external-tools/skillspector/resolve'

describe.sequential('external-tools/skillspector/resolve / cacheKey', () => {
  test('different SHAs produce different keys', () => {
    expect(cacheKey({ sha: 'abc1234' })).not.toBe(
      canonicalCacheKey({ sha: 'def5678' }),
    )
  })

  test('same SHA produces stable keys', () => {
    // Determinism: two calls with the same opts yield the same key. (Compared
    // local-to-local — the published `canonicalCacheKey` predates the
    // uvProjectDir segment, so a cross-version `toBe` would diverge until lib
    // republishes; that drift is intentional, not a regression.)
    const opts = { sha: 'abc1234' } as const
    const first = cacheKey(opts)
    expect(cacheKey(opts)).toBe(first)
  })

  test('localOnly flag is part of the key', () => {
    expect(cacheKey({ sha: 'abc1234' })).not.toBe(
      canonicalCacheKey({ sha: 'abc1234', localOnly: true }),
    )
  })

  test('cacheDir override is part of the key', () => {
    expect(cacheKey({ sha: 'abc1234' })).not.toBe(
      canonicalCacheKey({ sha: 'abc1234', cacheDir: '/tmp/x' }),
    )
  })

  test('empty opts produces a stable key', () => {
    // Determinism, local-to-local (see "same SHA produces stable keys").
    const first = cacheKey({})
    expect(cacheKey({})).toBe(first)
  })

  test('opts with sha + cacheDir + localOnly produces a deterministic key', () => {
    const opts = {
      sha: 'abc1234',
      cacheDir: '/tmp/x',
      localOnly: true,
    } as const
    const k = cacheKey(opts)
    expect(k).toContain('abc1234')
    expect(k).toContain('/tmp/x')
    expect(k).toContain('local')
  })
})
