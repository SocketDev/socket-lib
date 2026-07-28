/**
 * @file Unit tests for fs/read-json-cache.ts — process-scoped LRU cache for
 *   readJson results. Tests cover set/get/clear, stat-based invalidation, TTL
 *   eviction, LRU eviction when max is exceeded, env-var configuration, and
 *   defensive cloning on hit + insert.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearReadJsonCache,
  getCachedJson,
  getReadJsonCacheStats,
  readMaxFromEnv,
  readTtlFromEnv,
  setCachedJson,
  setReadJsonCacheMax,
  setReadJsonCacheTtlMs,
} from '../../../src/fs/read-json-cache'
import { tolerantSleep } from '../../_shared/fleet/lib/timing.mts'

beforeEach(() => {
  clearReadJsonCache()
  // Restore the runtime cap + TTL to known values so the order tests run
  // in doesn't matter.
  setReadJsonCacheMax(256)
  setReadJsonCacheTtlMs(5 * 60 * 1000)
})

afterEach(() => {
  clearReadJsonCache()
  vi.unstubAllEnvs()
})

describe.sequential('fs/read-json-cache — clearReadJsonCache', () => {
  it('drops all entries and resets hits/misses', () => {
    setCachedJson('/a', 1, 1, 1, { x: 1 })
    getCachedJson('/a', 1, 1, 1)
    getCachedJson('/missing', 0, 0, 0)
    let stats = getReadJsonCacheStats()
    expect(stats.size).toBe(1)
    expect(stats.hits).toBe(1)
    expect(stats.misses).toBe(1)

    clearReadJsonCache()
    stats = getReadJsonCacheStats()
    expect(stats.size).toBe(0)
    expect(stats.hits).toBe(0)
    expect(stats.misses).toBe(0)
  })
})

describe.sequential('fs/read-json-cache — set/get round-trip', () => {
  it('round-trips a value when the stat signature matches', () => {
    setCachedJson('/a', 1, 100, 200, { name: 'a' })
    const result = getCachedJson('/a', 1, 100, 200)
    expect(result).toEqual({ name: 'a' })
  })

  it('returns undefined on miss', () => {
    expect(getCachedJson('/absent', 0, 0, 0)).toBeUndefined()
  })

  it('returns undefined when ino mismatches', () => {
    setCachedJson('/a', 1, 100, 200, { name: 'a' })
    expect(getCachedJson('/a', 99, 100, 200)).toBeUndefined()
  })

  it('returns undefined when size mismatches', () => {
    setCachedJson('/a', 1, 100, 200, { name: 'a' })
    expect(getCachedJson('/a', 1, 999, 200)).toBeUndefined()
  })

  it('returns undefined when mtimeMs mismatches', () => {
    setCachedJson('/a', 1, 100, 200, { name: 'a' })
    expect(getCachedJson('/a', 1, 100, 999)).toBeUndefined()
  })

  it('drops the stale entry after stat mismatch (single miss, not repeated)', () => {
    setCachedJson('/a', 1, 100, 200, { name: 'a' })
    getCachedJson('/a', 1, 100, 999) // miss → drops
    // Subsequent lookup with matching key still misses (entry is gone).
    getCachedJson('/a', 1, 100, 200)
    expect(getReadJsonCacheStats().size).toBe(0)
  })
})

describe.sequential('fs/read-json-cache — defensive cloning', () => {
  it("returns a clone on hit so caller mutations don't poison the cache", () => {
    setCachedJson('/a', 1, 1, 1, { nested: { count: 0 } })
    const a = getCachedJson('/a', 1, 1, 1) as { nested: { count: number } }
    a.nested.count = 999
    const b = getCachedJson('/a', 1, 1, 1) as { nested: { count: number } }
    expect(b.nested.count).toBe(0)
  })

  it("stores a clone on insert so caller mutations after set don't bleed in", () => {
    const original = { nested: { count: 0 } }
    setCachedJson('/a', 1, 1, 1, original)
    original.nested.count = 999
    const got = getCachedJson('/a', 1, 1, 1) as { nested: { count: number } }
    expect(got.nested.count).toBe(0)
  })
})

describe.sequential('fs/read-json-cache — LRU eviction', () => {
  it('evicts the oldest entry when max is reached', () => {
    setReadJsonCacheMax(2)
    setCachedJson('/a', 1, 1, 1, { v: 'a' })
    setCachedJson('/b', 1, 1, 1, { v: 'b' })
    setCachedJson('/c', 1, 1, 1, { v: 'c' }) // evicts /a
    expect(getCachedJson('/a', 1, 1, 1)).toBeUndefined()
    expect(getCachedJson('/b', 1, 1, 1)).toEqual({ v: 'b' })
    expect(getCachedJson('/c', 1, 1, 1)).toEqual({ v: 'c' })
  })

  it('setReadJsonCacheMax trims excess on shrink', () => {
    setCachedJson('/a', 1, 1, 1, { v: 'a' })
    setCachedJson('/b', 1, 1, 1, { v: 'b' })
    setCachedJson('/c', 1, 1, 1, { v: 'c' })
    setReadJsonCacheMax(1)
    expect(getReadJsonCacheStats().size).toBe(1)
    // The youngest entry (/c) should survive.
    expect(getCachedJson('/c', 1, 1, 1)).toEqual({ v: 'c' })
  })

  it('setReadJsonCacheMax rejects non-positive / non-finite values', () => {
    expect(() => setReadJsonCacheMax(0)).toThrow(/positive finite/)
    expect(() => setReadJsonCacheMax(-1)).toThrow(/positive finite/)
    expect(() => setReadJsonCacheMax(Number.POSITIVE_INFINITY)).toThrow(
      /positive finite/,
    )
    expect(() => setReadJsonCacheMax(Number.NaN)).toThrow(/positive finite/)
  })
})

describe.sequential('fs/read-json-cache — TTL eviction', () => {
  it('ttlMs=0 disables time-based eviction', () => {
    setReadJsonCacheTtlMs(0)
    setCachedJson('/a', 1, 1, 1, { v: 'a' })
    // Even a long simulated wait should not evict (the timestamp gate
    // is bypassed when ttlMs is 0).
    expect(getCachedJson('/a', 1, 1, 1)).toEqual({ v: 'a' })
  })

  it('evicts entries whose age exceeds ttlMs', async () => {
    setReadJsonCacheTtlMs(1) // 1ms TTL — easy to overshoot
    setCachedJson('/a', 1, 1, 1, { v: 'a' })
    // Wait long enough that the entry definitely exceeds TTL.
    await new Promise(resolve => setTimeout(resolve, tolerantSleep(20)))
    expect(getCachedJson('/a', 1, 1, 1)).toBeUndefined()
    expect(getReadJsonCacheStats().size).toBe(0)
  })

  it('setReadJsonCacheTtlMs rejects negative / non-finite values', () => {
    expect(() => setReadJsonCacheTtlMs(-1)).toThrow(/non-negative finite/)
    expect(() => setReadJsonCacheTtlMs(Number.POSITIVE_INFINITY)).toThrow(
      /non-negative finite/,
    )
    expect(() => setReadJsonCacheTtlMs(Number.NaN)).toThrow(
      /non-negative finite/,
    )
  })
})

describe.sequential('fs/read-json-cache — env-var config', () => {
  it('readMaxFromEnv returns default when env is unset', () => {
    vi.stubEnv('SOCKET_LIB_READ_JSON_CACHE_MAX', '')
    expect(readMaxFromEnv()).toBe(256)
  })

  it('readMaxFromEnv honors a positive integer', () => {
    vi.stubEnv('SOCKET_LIB_READ_JSON_CACHE_MAX', '64')
    expect(readMaxFromEnv()).toBe(64)
  })

  it('readMaxFromEnv falls back to default on non-positive', () => {
    vi.stubEnv('SOCKET_LIB_READ_JSON_CACHE_MAX', '0')
    expect(readMaxFromEnv()).toBe(256)
  })

  it('readMaxFromEnv falls back to default on non-numeric', () => {
    vi.stubEnv('SOCKET_LIB_READ_JSON_CACHE_MAX', 'not-a-number')
    expect(readMaxFromEnv()).toBe(256)
  })

  it('readTtlFromEnv returns default when env is unset', () => {
    vi.stubEnv('SOCKET_LIB_READ_JSON_CACHE_TTL_MS', '')
    expect(readTtlFromEnv()).toBe(5 * 60 * 1000)
  })

  it('readTtlFromEnv honors 0 (means disabled)', () => {
    vi.stubEnv('SOCKET_LIB_READ_JSON_CACHE_TTL_MS', '0')
    expect(readTtlFromEnv()).toBe(0)
  })

  it('readTtlFromEnv honors a positive integer', () => {
    vi.stubEnv('SOCKET_LIB_READ_JSON_CACHE_TTL_MS', '1000')
    expect(readTtlFromEnv()).toBe(1000)
  })

  it('readTtlFromEnv falls back to default on negative input', () => {
    vi.stubEnv('SOCKET_LIB_READ_JSON_CACHE_TTL_MS', '-5')
    expect(readTtlFromEnv()).toBe(5 * 60 * 1000)
  })
})

describe.sequential('fs/read-json-cache — getReadJsonCacheStats', () => {
  it('reports size + max + ttlMs + hits + misses', () => {
    setReadJsonCacheMax(10)
    setReadJsonCacheTtlMs(2000)
    setCachedJson('/a', 1, 1, 1, { v: 'a' })
    getCachedJson('/a', 1, 1, 1)
    getCachedJson('/absent', 0, 0, 0)
    const stats = getReadJsonCacheStats()
    expect(stats.size).toBe(1)
    expect(stats.max).toBe(10)
    expect(stats.ttlMs).toBe(2000)
    expect(stats.hits).toBe(1)
    expect(stats.misses).toBe(1)
  })
})
