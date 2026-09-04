/**
 * @file The git-diff memo cache. It is a plain Map with a TTL and an LRU
 *   eviction, and both of those only fire on paths a normal run never takes:
 *   a query repeated after the window closes, and a caller churning more
 *   distinct queries than the cache holds. The Map and the two limits are
 *   exported, so both are reachable here without waiting or shelling out.
 */

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  getCachedGitDiff,
  gitDiffCache,
  setCachedGitDiff,
  stableKey,
} from '../../../src/git/shared.mjs'

// Written out rather than imported: a cap read from the source under test
// agrees with it by construction and would follow a wrong edit.
const CACHE_MAX_SIZE = 100

beforeEach(() => {
  gitDiffCache.clear()
})

afterEach(() => {
  gitDiffCache.clear()
})

describe('getCachedGitDiff', () => {
  it('reports nothing for a key it never stored', () => {
    expect(getCachedGitDiff('absent')).toBeUndefined()
  })

  it('returns a stored result', () => {
    setCachedGitDiff('example', ['src/example.mts'])

    expect(getCachedGitDiff('example')).toEqual(['src/example.mts'])
  })

  it('drops an entry whose window has closed', () => {
    // Written with an expiry already in the past, which is what the clock
    // would have produced a few seconds later.
    gitDiffCache.set('stale', { expiresAt: 1, result: ['src/stale.mts'] })

    expect(getCachedGitDiff('stale')).toBeUndefined()
    expect(gitDiffCache.has('stale')).toBe(false)
  })

  it('moves a hit to the most-recently-used end', () => {
    // Eviction takes the first key the Map yields, so a hit has to be
    // re-inserted or the cache evicts the entry it just served.
    setCachedGitDiff('first', ['a'])
    setCachedGitDiff('second', ['b'])
    getCachedGitDiff('first')

    expect([...gitDiffCache.keys()]).toEqual(['second', 'first'])
  })
})

describe('setCachedGitDiff', () => {
  it('evicts the oldest entry once the cache is full', () => {
    for (let i = 0; i < CACHE_MAX_SIZE; i += 1) {
      setCachedGitDiff(`key-${i}`, [`src/file-${i}.mts`])
    }
    expect(gitDiffCache.size).toBe(CACHE_MAX_SIZE)

    setCachedGitDiff('one-too-many', ['src/newest.mts'])

    expect(gitDiffCache.size).toBe(CACHE_MAX_SIZE)
    expect(gitDiffCache.has('key-0')).toBe(false)
    expect(gitDiffCache.has('one-too-many')).toBe(true)
  })
})

describe('stableKey', () => {
  it('reads the same for two objects written in different orders', () => {
    const written = stableKey({ absolute: true, cwd: '/repo' })
    const reordered = stableKey({ cwd: '/repo', absolute: true })

    expect(written).toBe(reordered)
    expect(written).toBe('{"absolute":true,"cwd":"/repo"}')
  })

  it('still separates two objects that differ', () => {
    const one = stableKey({ cwd: '/repo' })
    const other = stableKey({ cwd: '/other' })

    expect(one).not.toBe(other)
  })
})
