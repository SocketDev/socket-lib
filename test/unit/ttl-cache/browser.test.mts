/**
 * @file Unit tests for `createBrowserTtlCache` core semantics — hit/miss,
 *   expiry, TTL boundary, clock-skew detection, LRU eviction + recency bump,
 *   `getOrFetch` thundering-herd dedup + failure retry, memo-only mode, and
 *   wildcard-key rejection. Pure in-memory — no filesystem, no env rewiring.
 *   Storage-adapter behavior (round-trips, corruption, failures) lives in the
 *   sibling browser-storage.test.mts.
 */

import { describe, expect, it } from 'vitest'

import { createBrowserTtlCache } from '../../../src/cache/ttl/browser'
import { tolerantSleep } from '../../_shared/fleet/lib/timing.mts'
import { createDeferred, createMemoryAdapter } from './browser-test-helpers.mts'

describe('browser ttl-cache', () => {
  describe('createBrowserTtlCache', () => {
    it('creates a cache with default options', () => {
      const cache = createBrowserTtlCache()
      expect(typeof cache.clear).toBe('function')
      expect(typeof cache.delete).toBe('function')
      expect(typeof cache.deleteAll).toBe('function')
      expect(typeof cache.get).toBe('function')
      expect(typeof cache.getAll).toBe('function')
      expect(typeof cache.getOrFetch).toBe('function')
      expect(typeof cache.set).toBe('function')
    })

    it('throws TypeError for prefix with wildcards', () => {
      expect(() => createBrowserTtlCache({ prefix: 'test-*' })).toThrow(
        TypeError,
      )
      expect(() => createBrowserTtlCache({ prefix: '*-cache' })).toThrow(
        TypeError,
      )
    })
  })

  describe('set and get (memo-only mode)', () => {
    it('round-trips values without any storage adapter', async () => {
      const cache = createBrowserTtlCache({ prefix: 'memo-only' })
      await cache.set('string', 'hello')
      await cache.set('number', 42)
      await cache.set('object', { foo: 'bar' })
      await cache.set('array', [1, 2, 3])
      expect(await cache.get<string>('string')).toBe('hello')
      expect(await cache.get<number>('number')).toBe(42)
      expect(await cache.get<{ foo: string }>('object')).toEqual({
        foo: 'bar',
      })
      expect(await cache.get<number[]>('array')).toEqual([1, 2, 3])
    })

    it('returns undefined for a non-existent key', async () => {
      const cache = createBrowserTtlCache()
      expect(await cache.get('nope')).toBeUndefined()
    })

    it('overwrites an existing value', async () => {
      const cache = createBrowserTtlCache()
      await cache.set('key', 'v1')
      await cache.set('key', 'v2')
      expect(await cache.get('key')).toBe('v2')
    })

    it('delete removes an entry; deleteAll and getAll stay correct', async () => {
      const cache = createBrowserTtlCache({ prefix: 'memo-ops' })
      await cache.set('a', 1)
      await cache.set('b', 2)
      await cache.delete('a')
      expect(await cache.get('a')).toBeUndefined()
      expect(await cache.get('b')).toBe(2)
      const all = await cache.getAll<number>('*')
      expect([...all.entries()]).toEqual([['b', 2]])
      expect(await cache.deleteAll()).toBe(1)
      expect(await cache.get('b')).toBeUndefined()
    })
  })

  describe('TTL expiry', () => {
    it('treats an entry written with a negative ttl as already expired', async () => {
      const cache = createBrowserTtlCache({ ttl: -1 })
      await cache.set('key', 'value')
      expect(await cache.get('key')).toBeUndefined()
    })

    it('keeps an entry alive within its ttl and expires it after', async () => {
      const cache = createBrowserTtlCache({ ttl: 100 })
      await cache.set('key', 'value')
      expect(await cache.get('key')).toBe('value')
      await new Promise(resolve => setTimeout(resolve, tolerantSleep(200)))
      expect(await cache.get('key')).toBeUndefined()
    })

    it('holds at the ttl boundary: expiresAt in the future is valid, in the past is expired', async () => {
      const ttl = 60_000
      const adapter = createMemoryAdapter()
      const cache = createBrowserTtlCache({
        prefix: 'boundary',
        storage: adapter,
        ttl,
      })
      adapter.store.set(
        'boundary:alive',
        JSON.stringify({ data: 'ok', expiresAt: Date.now() + ttl }),
      )
      adapter.store.set(
        'boundary:dead',
        JSON.stringify({ data: 'ko', expiresAt: Date.now() - 1 }),
      )
      expect(await cache.get('alive')).toBe('ok')
      expect(await cache.get('dead')).toBeUndefined()
      // The expired entry is deleted from storage best-effort.
      expect(adapter.store.has('boundary:dead')).toBe(false)
    })
  })

  describe('clock-skew detection', () => {
    it('treats a suspiciously far-future expiresAt as expired and deletes it', async () => {
      const ttl = 1000
      const adapter = createMemoryAdapter()
      const cache = createBrowserTtlCache({
        prefix: 'skew',
        storage: adapter,
        ttl,
      })
      // More than ttl + 10s past now — clock skew or corruption.
      adapter.store.set(
        'skew:key',
        JSON.stringify({ data: 'bogus', expiresAt: Date.now() + ttl + 60_000 }),
      )
      expect(await cache.get('key')).toBeUndefined()
      expect(adapter.store.has('skew:key')).toBe(false)
    })

    it('expires entries written under a larger ttl when the configured ttl shrinks', async () => {
      const adapter = createMemoryAdapter()
      const writer = createBrowserTtlCache({
        prefix: 'shrink',
        storage: adapter,
        ttl: 100_000,
      })
      await writer.set('key', 'value')
      const reader = createBrowserTtlCache({
        prefix: 'shrink',
        storage: adapter,
        ttl: 1000,
      })
      // expiresAt = now + 100_000 exceeds the reader's now + 1000 + 10_000
      // skew horizon, so the reader treats the entry as expired.
      expect(await reader.get('key')).toBeUndefined()
    })
  })

  describe('LRU memo eviction', () => {
    it('evicts the oldest entry when memoMaxSize is reached', async () => {
      const cache = createBrowserTtlCache({ memoMaxSize: 2 })
      await cache.set('a', 1)
      await cache.set('b', 2)
      await cache.set('c', 3)
      expect(await cache.get('a')).toBeUndefined()
      expect(await cache.get('b')).toBe(2)
      expect(await cache.get('c')).toBe(3)
    })

    it('bumps recency on get so colder entries evict first', async () => {
      const cache = createBrowserTtlCache({ memoMaxSize: 2 })
      await cache.set('a', 1)
      await cache.set('b', 2)
      // Touch 'a' so 'b' becomes the eviction candidate.
      expect(await cache.get('a')).toBe(1)
      await cache.set('c', 3)
      expect(await cache.get('b')).toBeUndefined()
      expect(await cache.get('a')).toBe(1)
      expect(await cache.get('c')).toBe(3)
    })

    it('bumps recency on re-set', async () => {
      const cache = createBrowserTtlCache({ memoMaxSize: 2 })
      await cache.set('a', 1)
      await cache.set('b', 2)
      await cache.set('a', 10)
      await cache.set('c', 3)
      expect(await cache.get('b')).toBeUndefined()
      expect(await cache.get('a')).toBe(10)
      expect(await cache.get('c')).toBe(3)
    })

    it('clamps memoMaxSize to at least 1', async () => {
      const cache = createBrowserTtlCache({ memoMaxSize: 0 })
      await cache.set('a', 1)
      await cache.set('b', 2)
      expect(await cache.get('a')).toBeUndefined()
      expect(await cache.get('b')).toBe(2)
    })
  })

  describe('getOrFetch', () => {
    it('returns the cached value without invoking the fetcher', async () => {
      const cache = createBrowserTtlCache()
      await cache.set('key', 'cached')
      let calls = 0
      const value = await cache.getOrFetch('key', async () => {
        calls += 1
        return 'fetched'
      })
      expect(value).toBe('cached')
      expect(calls).toBe(0)
    })

    it('fetches on miss and caches the result', async () => {
      const cache = createBrowserTtlCache()
      let calls = 0
      const fetcher = async () => {
        calls += 1
        return 'fetched'
      }
      expect(await cache.getOrFetch('key', fetcher)).toBe('fetched')
      expect(await cache.getOrFetch('key', fetcher)).toBe('fetched')
      expect(calls).toBe(1)
    })

    it('dedupes concurrent callers into one fetch', async () => {
      const cache = createBrowserTtlCache()
      const deferred = createDeferred<string>()
      let calls = 0
      const fetcher = () => {
        calls += 1
        return deferred.promise
      }
      // Both callers start before the fetch registers — the second joins via
      // the post-get recheck.
      const first = cache.getOrFetch('key', fetcher)
      const second = cache.getOrFetch('key', fetcher)
      // A third caller starts after registration — it joins via the
      // preexisting-inflight fast path.
      await new Promise(resolve => setTimeout(resolve, 0))
      const third = cache.getOrFetch('key', fetcher)
      deferred.resolve('shared')
      expect(await Promise.all([first, second, third])).toEqual([
        'shared',
        'shared',
        'shared',
      ])
      expect(calls).toBe(1)
    })

    it('clears the in-flight slot on failure so callers can retry', async () => {
      const cache = createBrowserTtlCache()
      const deferred = createDeferred<string>()
      let calls = 0
      const failing = () => {
        calls += 1
        return deferred.promise
      }
      const first = cache.getOrFetch('key', failing)
      const second = cache.getOrFetch('key', failing)
      deferred.reject(new Error('fetch failed'))
      await expect(first).rejects.toThrow('fetch failed')
      await expect(second).rejects.toThrow('fetch failed')
      expect(calls).toBe(1)
      // Retry succeeds — the failed fetch did not poison the cache.
      const value = await cache.getOrFetch('key', async () => 'recovered')
      expect(value).toBe('recovered')
      expect(await cache.get('key')).toBe('recovered')
    })

    it('persists the fetched value into the storage adapter', async () => {
      const adapter = createMemoryAdapter()
      const cache = createBrowserTtlCache({
        prefix: 'fetch',
        storage: adapter,
      })
      await cache.getOrFetch('key', async () => 'stored')
      expect(adapter.store.has('fetch:key')).toBe(true)
    })
  })

  describe('wildcard-key rejection', () => {
    it('get, set, and delete throw TypeError on wildcard keys', async () => {
      const cache = createBrowserTtlCache()
      await expect(cache.get('a*b')).rejects.toThrow(TypeError)
      await expect(cache.set('*', 1)).rejects.toThrow(TypeError)
      await expect(cache.delete('key*')).rejects.toThrow(TypeError)
    })

    it('getAll anchors wildcard patterns at both ends', async () => {
      const cache = createBrowserTtlCache({ prefix: 'anchor' })
      await cache.set('foo-mid-bar', 1)
      await cache.set('foo-mid-bar-tail', 2)
      const matches = await cache.getAll<number>('foo*bar')
      expect([...matches.entries()]).toEqual([['foo-mid-bar', 1]])
    })
  })
})
