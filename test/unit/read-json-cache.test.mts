/**
 * @file Unit tests for the readJson / readJsonSync default-on cache. Validates
 *   the safety guards that make default-on caching correct:
 *
 *   - Cache hit returns a structuredClone (caller mutation doesn't poison the
 *     next reader).
 *   - File modification invalidates the cache (mtime/size change ⇒ miss).
 *   - `cache: false` bypasses the cache.
 *   - `reviver` bypasses the cache.
 *   - `clearReadJsonCache()` drops all entries.
 *   - `setReadJsonCacheMax(n)` enforces the LRU cap.
 *   - `setReadJsonCacheTtlMs(n)` enforces time-based ejection.
 */

import { promises as fs, writeFileSync } from 'node:fs'
import os from 'node:os'
import path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  clearReadJsonCache,
  getReadJsonCacheStats,
  readJson,
  readJsonSync,
  setReadJsonCacheMax,
  setReadJsonCacheTtlMs,
} from '../../src/fs/read-json'
import { safeDelete } from '@socketsecurity/lib-stable/fs/safe'

let tmpDir: string

beforeEach(async () => {
  tmpDir = await fs.mkdtemp(path.join(os.tmpdir(), 'read-json-cache-'))
  clearReadJsonCache()
})

afterEach(async () => {
  await safeDelete(tmpDir)
})

describe.sequential('readJson cache (async)', () => {
  it('caches successive reads of the same file', async () => {
    const file = path.join(tmpDir, 'a.json')
    await fs.writeFile(file, JSON.stringify({ count: 1 }))
    await readJson(file)
    const before = getReadJsonCacheStats()
    await readJson(file)
    const after = getReadJsonCacheStats()
    expect(after.hits).toBe(before.hits + 1)
  })

  it('returns a deep clone on hit so caller mutation is isolated', async () => {
    const file = path.join(tmpDir, 'a.json')
    await fs.writeFile(file, JSON.stringify({ items: [1, 2, 3] }))
    const first = (await readJson(file)) as { items: number[] }
    first.items.push(999)
    const second = (await readJson(file)) as { items: number[] }
    expect(second.items).toEqual([1, 2, 3])
  })

  it('invalidates when the file changes on disk', async () => {
    const file = path.join(tmpDir, 'a.json')
    await fs.writeFile(file, JSON.stringify({ v: 1 }))
    const v1 = (await readJson(file)) as { v: number }
    expect(v1.v).toBe(1)
    // Wait a sliver to ensure mtimeMs changes on filesystems with 1ms resolution.
    await new Promise(r => setTimeout(r, 20))
    await fs.writeFile(file, JSON.stringify({ v: 2 }))
    const v2 = (await readJson(file)) as { v: number }
    expect(v2.v).toBe(2)
  })

  it('bypasses the cache when cache: false', async () => {
    const file = path.join(tmpDir, 'a.json')
    await fs.writeFile(file, JSON.stringify({ v: 1 }))
    await readJson(file)
    const before = getReadJsonCacheStats()
    await readJson(file, { cache: false })
    const after = getReadJsonCacheStats()
    expect(after.hits).toBe(before.hits)
  })

  it('bypasses the cache when a reviver is passed', async () => {
    const file = path.join(tmpDir, 'a.json')
    await fs.writeFile(file, JSON.stringify({ v: 1 }))
    await readJson(file)
    const before = getReadJsonCacheStats()
    await readJson(file, { reviver: (_k, v) => v })
    const after = getReadJsonCacheStats()
    expect(after.hits).toBe(before.hits)
  })
})

describe.sequential('readJsonSync cache', () => {
  it('caches successive reads', () => {
    const file = path.join(tmpDir, 'a.json')
    writeFileSync(file, JSON.stringify({ count: 1 }))
    readJsonSync(file)
    const before = getReadJsonCacheStats()
    readJsonSync(file)
    const after = getReadJsonCacheStats()
    expect(after.hits).toBe(before.hits + 1)
  })

  it('isolates caller mutation', () => {
    const file = path.join(tmpDir, 'a.json')
    writeFileSync(file, JSON.stringify({ items: [1, 2, 3] }))
    const first = readJsonSync(file) as { items: number[] }
    first.items.push(999)
    const second = readJsonSync(file) as { items: number[] }
    expect(second.items).toEqual([1, 2, 3])
  })
})

describe.sequential('cache controls', () => {
  it('clearReadJsonCache drops all entries and resets stats', async () => {
    const file = path.join(tmpDir, 'a.json')
    await fs.writeFile(file, JSON.stringify({ v: 1 }))
    await readJson(file)
    await readJson(file)
    expect(getReadJsonCacheStats().size).toBeGreaterThan(0)
    expect(getReadJsonCacheStats().hits).toBeGreaterThan(0)
    clearReadJsonCache()
    const stats = getReadJsonCacheStats()
    expect(stats.size).toBe(0)
    expect(stats.hits).toBe(0)
    expect(stats.misses).toBe(0)
  })

  it('setReadJsonCacheMax enforces the LRU cap', async () => {
    setReadJsonCacheMax(2)
    try {
      const a = path.join(tmpDir, 'a.json')
      const b = path.join(tmpDir, 'b.json')
      const c = path.join(tmpDir, 'c.json')
      await fs.writeFile(a, JSON.stringify({ k: 'a' }))
      await fs.writeFile(b, JSON.stringify({ k: 'b' }))
      await fs.writeFile(c, JSON.stringify({ k: 'c' }))
      await readJson(a)
      await readJson(b)
      await readJson(c)
      // Cap of 2 → oldest (a) should be evicted.
      expect(getReadJsonCacheStats().size).toBe(2)
    } finally {
      setReadJsonCacheMax(256)
    }
  })

  it('setReadJsonCacheTtlMs invalidates entries past the TTL', async () => {
    setReadJsonCacheTtlMs(50)
    try {
      const file = path.join(tmpDir, 'a.json')
      await fs.writeFile(file, JSON.stringify({ v: 1 }))
      await readJson(file)
      const beforeStats = getReadJsonCacheStats()
      // Wait past the TTL.
      await new Promise(r => setTimeout(r, 80))
      await readJson(file)
      const afterStats = getReadJsonCacheStats()
      // The post-TTL read should NOT be a hit.
      expect(afterStats.hits).toBe(beforeStats.hits)
    } finally {
      setReadJsonCacheTtlMs(5 * 60 * 1000)
    }
  })

  it('rejects invalid setReadJsonCacheMax inputs', () => {
    expect(() => setReadJsonCacheMax(0)).toThrow()
    expect(() => setReadJsonCacheMax(-1)).toThrow()
    expect(() => setReadJsonCacheMax(Number.NaN)).toThrow()
  })

  it('rejects invalid setReadJsonCacheTtlMs inputs', () => {
    expect(() => setReadJsonCacheTtlMs(-1)).toThrow()
    expect(() => setReadJsonCacheTtlMs(Number.NaN)).toThrow()
    // Zero IS allowed (disables time-based ejection).
    expect(() => setReadJsonCacheTtlMs(0)).not.toThrow()
    setReadJsonCacheTtlMs(5 * 60 * 1000)
  })
})
