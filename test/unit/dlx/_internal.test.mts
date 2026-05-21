import { beforeEach, describe, expect, test } from 'vitest'

import {
  BINARY_PATH_CACHE_MAX_SIZE,
  binaryPathCache,
  binaryPathCacheSet,
} from '../../../src/dlx/_internal'

beforeEach(() => {
  binaryPathCache.clear()
})

describe.sequential('dlx/_internal — binaryPathCacheSet (bounded LRU)', () => {
  test('sets a value the first time', () => {
    binaryPathCacheSet('key', '/path/value')
    expect(binaryPathCache.get('key')).toBe('/path/value')
  })

  test('updating an existing key bumps it to MRU (re-insertion)', () => {
    binaryPathCacheSet('a', '/a')
    binaryPathCacheSet('b', '/b')
    binaryPathCacheSet('c', '/c')
    // Touching 'a' should re-insert it as most-recently-used.
    binaryPathCacheSet('a', '/a-new')
    // Map iteration order = insertion order; the LRU should now be 'b'.
    const keys = [...binaryPathCache.keys()]
    expect(keys).toEqual(['b', 'c', 'a'])
    expect(binaryPathCache.get('a')).toBe('/a-new')
  })

  test('exports a 200-entry cap constant', () => {
    expect(BINARY_PATH_CACHE_MAX_SIZE).toBe(200)
  })

  test('evicts the LRU entry when the cap is exceeded', () => {
    // Fill to the cap.
    for (let i = 0; i < BINARY_PATH_CACHE_MAX_SIZE; i += 1) {
      binaryPathCacheSet(`k${i}`, `/v${i}`)
    }
    expect(binaryPathCache.size).toBe(BINARY_PATH_CACHE_MAX_SIZE)
    // One more entry triggers LRU eviction of `k0`.
    binaryPathCacheSet('newest', '/newest')
    expect(binaryPathCache.size).toBe(BINARY_PATH_CACHE_MAX_SIZE)
    expect(binaryPathCache.has('k0')).toBe(false)
    expect(binaryPathCache.has('newest')).toBe(true)
  })

  test('touching an entry near the LRU prevents its eviction on next insert', () => {
    for (let i = 0; i < BINARY_PATH_CACHE_MAX_SIZE; i += 1) {
      binaryPathCacheSet(`k${i}`, `/v${i}`)
    }
    // Bump k0 to MRU.
    binaryPathCacheSet('k0', '/v0-touched')
    binaryPathCacheSet('newest', '/newest')
    // Now k1 is the LRU and should be the one evicted.
    expect(binaryPathCache.has('k0')).toBe(true)
    expect(binaryPathCache.has('k1')).toBe(false)
  })
})
