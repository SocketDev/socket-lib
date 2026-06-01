import { describe, expect, test } from 'vitest'

import { cacheKey } from '../../../../src/external-tools/skillspector/resolve'

describe.sequential('external-tools/skillspector/resolve / cacheKey', () => {
  test('different SHAs produce different keys', () => {
    expect(cacheKey({ sha: 'abc1234' })).not.toBe(
      cacheKey({ sha: 'def5678' }),
    )
  })

  test('same SHA produces stable keys', () => {
    const opts = { sha: 'abc1234' } as const
    expect(cacheKey(opts)).toBe(cacheKey(opts))
  })

  test('localOnly flag is part of the key', () => {
    expect(cacheKey({ sha: 'abc1234' })).not.toBe(
      cacheKey({ sha: 'abc1234', localOnly: true }),
    )
  })

  test('cacheDir override is part of the key', () => {
    expect(cacheKey({ sha: 'abc1234' })).not.toBe(
      cacheKey({ sha: 'abc1234', cacheDir: '/tmp/x' }),
    )
  })

  test('empty opts produces a stable key', () => {
    expect(cacheKey({})).toBe(cacheKey({}))
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
