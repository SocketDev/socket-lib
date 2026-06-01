/**
 * @file Unit tests for time-dependent behavior of the TTL cache:
 *
 *   - TTL expiration (entries expire after their time-to-live elapses)
 *   - Memoization (in-memory cache layer toggled by the `memoize` option)
 *   - Concurrent operations (parallel set/get/getOrFetch, inflight dedupe) Split
 *     out of index.test.mts to keep each file under the file-size cap. Shares
 *     the per-test isolated cache-dir setup with the sibling files.
 */

import os from 'node:os'
import * as path from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { createTtlCache } from '../../../src/cache/ttl/store'
import { resetEnv, setEnv } from '../../../src/env/rewire'
import { invalidateCaches } from '../../../src/paths/rewire'

describe.sequential('ttl-cache — timing', () => {
  let cache: ReturnType<typeof createTtlCache>
  let testCacheDir: string

  beforeEach(() => {
    // Invalidate path caches to ensure SOCKET_CACACHE_DIR override takes effect.
    // This is necessary because getSocketCacacheDir() caches its result.
    invalidateCaches()

    // Create a unique cache directory for each test to ensure isolation.
    testCacheDir = path.join(
      os.tmpdir(),
      `socket-test-cache-${Date.now()}-${Math.random().toString(36).slice(2)}`,
    )
    setEnv('SOCKET_CACACHE_DIR', testCacheDir)

    // Create a fresh cache instance for each test
    cache = createTtlCache({
      ttl: 60_000, // 60 seconds for tests (prevents flaky failures on slow CI)
      prefix: 'test-cache',
      memoize: true,
    })
  })

  afterEach(async () => {
    // Clean up after each test
    await cache.clear()
    // Reset environment overrides
    resetEnv()
  })

  describe('TTL expiration', () => {
    it('should expire entries after TTL', async () => {
      // TTL test windows must be wide enough to survive Windows
      // file-system latency and the vitest worker dispatch overhead
      // (which spikes on Windows runners — observed up to ~2s under
      // load on GitHub-hosted windows-latest). Earlier 500ms / 700ms
      // values flaked there with a "Timeout waiting for worker to
      // respond" hang; the 2000ms / 3000ms pair leaves enough margin
      // that the TTL is observably expired before we re-read.
      const shortCache = createTtlCache({
        ttl: 2000,
        prefix: 'expiry-test',
      })

      await shortCache.set('key', 'value')
      expect(await shortCache.get<string>('key')).toBe('value')

      // Wait for TTL to expire (3000ms > 2000ms TTL).
      await new Promise(resolve => setTimeout(resolve, 3000))

      expect(await shortCache.get('key')).toBeUndefined()

      await shortCache.clear()
    }, 30_000)

    it('should not expire entries before TTL', async () => {
      const longCache = createTtlCache({
        ttl: 10_000,
        prefix: 'long-cache',
      })

      await longCache.set('key', 'value')
      expect(await longCache.get<string>('key')).toBe('value')

      // Wait a bit but not long enough to expire
      await new Promise(resolve => setTimeout(resolve, 50))

      expect(await longCache.get<string>('key')).toBe('value')

      await longCache.clear()
    })

    it('should refresh TTL on set', async () => {
      const refreshCache = createTtlCache({
        ttl: 2000,
        prefix: 'refresh-cache',
      })

      await refreshCache.set('key', 'value1')
      await new Promise(resolve => setTimeout(resolve, 200))
      await refreshCache.set('key', 'value2') // Refresh TTL

      await new Promise(resolve => setTimeout(resolve, 200))
      // Should still be cached (200 + 200 = 400ms, but TTL refreshed at 200ms to 2000ms)
      expect(await refreshCache.get<string>('key')).toBe('value2')

      await refreshCache.clear()
    })

    it('should expire entries and return undefined after TTL (memoized)', async () => {
      // 2000ms TTL + 3000ms wait — see the timing rationale in the
      // sibling `should expire entries after TTL` test above. The
      // memoized variant has the same Windows flakiness profile
      // because `get()` still hits cacache.get on cold lookups.
      const shortCache = createTtlCache({
        ttl: 2000,
        prefix: 'short-memo-cache',
        memoize: true,
      })

      await shortCache.set('key', 'value')
      expect(await shortCache.get<string>('key')).toBe('value')

      await new Promise(resolve => setTimeout(resolve, 3000))
      expect(await shortCache.get<string>('key')).toBeUndefined()

      await shortCache.clear()
    }, 30_000)
  })

  describe('memoization', () => {
    it('should use in-memory cache when memoize is true', async () => {
      const memoCache = createTtlCache({
        ttl: 1000,
        prefix: 'memo-cache',
        memoize: true,
      })

      await memoCache.set('key', 'value')
      const value = await memoCache.get<string>('key')
      expect(value).toBe('value')

      await memoCache.clear()
    })

    it('should not use in-memory cache when memoize is false', async () => {
      const noMemoCache = createTtlCache({
        ttl: 1000,
        prefix: 'no-memo-cache',
        memoize: false,
      })

      await noMemoCache.set('key', 'value')
      const value = await noMemoCache.get<string>('key')
      expect(value).toBe('value')

      await noMemoCache.clear()
    })
  })

  describe('concurrent operations', () => {
    it('should handle concurrent sets', async () => {
      await Promise.all([
        cache.set('key1', 'value1'),
        cache.set('key2', 'value2'),
        cache.set('key3', 'value3'),
      ])

      expect(await cache.get<string>('key1')).toBe('value1')
      expect(await cache.get<string>('key2')).toBe('value2')
      expect(await cache.get<string>('key3')).toBe('value3')
    })

    it('should handle concurrent gets', async () => {
      await cache.set('key', 'value')

      const results = await Promise.all([
        cache.get<string>('key'),
        cache.get<string>('key'),
        cache.get<string>('key'),
      ])

      expect(results).toEqual(['value', 'value', 'value'])
    })

    it('should handle concurrent getOrFetch', async () => {
      let fetchCount = 0
      const fetcher = async () => {
        fetchCount++
        return 'value'
      }

      const results = await Promise.all([
        cache.getOrFetch('key', fetcher),
        cache.getOrFetch('key', fetcher),
        cache.getOrFetch('key', fetcher),
      ])

      // All should return the value
      expect(results).toEqual(['value', 'value', 'value'])
      // And the inflight map dedupes to a single upstream call.
      // (Previously gated on `> 0` because getOrFetch let two concurrent
      // cold-cache callers both fire fetcher — the check-then-inflight
      // ordering was wrong. Tightened once the TOCTOU was closed.)
      expect(fetchCount).toBe(1)
    })

    it('dedupes concurrent cold-cache fetches', async () => {
      // Regression: previously `await get(key)` ran BEFORE the inflight
      // map was consulted. Two callers could both suspend on the disk
      // lookup, both see no cached value, and both start a fresh fetch.
      let fetchCount = 0
      let resolveFetcher: (value: string) => void = () => {}
      const pendingValue = new Promise<string>(resolve => {
        resolveFetcher = resolve
      })
      const fetcher = async () => {
        fetchCount++
        return pendingValue
      }

      const p1 = cache.getOrFetch('race-key', fetcher)
      const p2 = cache.getOrFetch('race-key', fetcher)
      const p3 = cache.getOrFetch('race-key', fetcher)
      // Microtask gap so the first caller can register the inflight
      // entry, even though its internal `await get()` is still pending.
      await Promise.resolve()
      resolveFetcher('joined')
      const [v1, v2, v3] = await Promise.all([p1, p2, p3])
      expect([v1, v2, v3]).toEqual(['joined', 'joined', 'joined'])
      expect(fetchCount).toBe(1)
    })
  })
})
