// Vitest specs for the SkillSpector resolver. Covers the cache-key
// derivation and the pure-helpers. The DLX-venv tier spawns Python and
// is exercised in a separate integration suite when CI has Python 3.12+;
// this file stays hermetic.

import { describe, expect, test } from 'vitest'

import { cacheKey } from '../resolve'

describe('skillspector / cacheKey', () => {
  test('different SHAs produce different keys', () => {
    const a = cacheKey({ sha: '2eb84478' })
    const b = cacheKey({ sha: 'abcd1234' })
    expect(a).not.toBe(b)
  })

  test('same SHA produces stable keys', () => {
    const opts = { sha: '2eb84478' } as const
    expect(cacheKey(opts)).toBe(cacheKey(opts))
  })

  test('localOnly flag is part of the key', () => {
    const sha = '2eb84478'
    const full = cacheKey({ sha })
    const local = cacheKey({ sha, localOnly: true })
    expect(full).not.toBe(local)
  })

  test('cacheDir override is part of the key', () => {
    const sha = '2eb84478'
    const a = cacheKey({ sha })
    const b = cacheKey({ sha, cacheDir: '/tmp/x' })
    expect(a).not.toBe(b)
  })

  test('empty opts produces a stable key', () => {
    expect(cacheKey({})).toBe(cacheKey({}))
  })
})
