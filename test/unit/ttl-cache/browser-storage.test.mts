/**
 * @file Unit tests for `createBrowserTtlCache` storage-adapter behavior —
 *   async + sync adapter round-trips, second-instance rehydration, memoize
 *   off, corrupt / shape-invalid entries, adapter failures never throwing,
 *   wildcard getAll / deleteAll / clear across both tiers, enumeration-less
 *   adapters, and foreign keys in shared storage. Core cache semantics live
 *   in the sibling browser.test.mts.
 */

import { describe, expect, it } from 'vitest'

import { createBrowserTtlCache } from '../../../src/cache/ttl/browser'
import { createMemoryAdapter } from './browser-test-helpers.mts'

import type { TtlCacheStorage } from '../../../src/cache/ttl/types'

describe('browser ttl-cache — storage adapter', () => {
  describe('round-trips', () => {
    it('persists entries as JSON under the full prefixed key', async () => {
      const adapter = createMemoryAdapter()
      const cache = createBrowserTtlCache({ prefix: 'rt', storage: adapter })
      await cache.set('key', { value: 42 })
      const raw = adapter.store.get('rt:key')
      expect(typeof raw).toBe('string')
      const entry = JSON.parse(raw as string)
      expect(entry.data).toEqual({ value: 42 })
      expect(typeof entry.expiresAt).toBe('number')
    })

    it('rehydrates a fresh instance from the same adapter', async () => {
      const adapter = createMemoryAdapter()
      const writer = createBrowserTtlCache({ prefix: 'rt', storage: adapter })
      await writer.set('key', 'persisted')
      const reader = createBrowserTtlCache({ prefix: 'rt', storage: adapter })
      expect(await reader.get('key')).toBe('persisted')
      expect(adapter.calls.getItem).toBe(1)
      // The read warmed the memo tier — a second get skips storage.
      expect(await reader.get('key')).toBe('persisted')
      expect(adapter.calls.getItem).toBe(1)
    })

    it('reads storage on every get when memoize is off', async () => {
      const adapter = createMemoryAdapter()
      const cache = createBrowserTtlCache({
        memoize: false,
        prefix: 'rt',
        storage: adapter,
      })
      await cache.set('key', 'value')
      expect(await cache.get('key')).toBe('value')
      expect(await cache.get('key')).toBe('value')
      expect(adapter.calls.getItem).toBe(2)
    })

    it('accepts a synchronous adapter (sessionStorage shape)', async () => {
      const store = new Map<string, string>()
      const syncAdapter: TtlCacheStorage = {
        getItem: (key: string) => store.get(key) ?? undefined,
        removeItem: (key: string) => {
          store.delete(key)
        },
        setItem: (key: string, value: string) => {
          store.set(key, value)
        },
      }
      const writer = createBrowserTtlCache({
        prefix: 'sync',
        storage: syncAdapter,
      })
      await writer.set('key', 'value')
      const reader = createBrowserTtlCache({
        prefix: 'sync',
        storage: syncAdapter,
      })
      expect(await reader.get('key')).toBe('value')
      await reader.delete('key')
      expect(store.size).toBe(0)
    })
  })

  describe('corrupt entries', () => {
    it('treats unparseable JSON as a miss and deletes it', async () => {
      const adapter = createMemoryAdapter()
      const cache = createBrowserTtlCache({ prefix: 'bad', storage: adapter })
      adapter.store.set('bad:key', 'not json {{{')
      expect(await cache.get('key')).toBeUndefined()
      expect(adapter.store.has('bad:key')).toBe(false)
    })

    it('treats shape-invalid entries as a miss and deletes them', async () => {
      const adapter = createMemoryAdapter()
      const cache = createBrowserTtlCache({ prefix: 'bad', storage: adapter })
      adapter.store.set('bad:number', '42')
      adapter.store.set('bad:no-expiry', JSON.stringify({ data: 1 }))
      adapter.store.set(
        'bad:string-expiry',
        JSON.stringify({ data: 1, expiresAt: 'soon' }),
      )
      expect(await cache.get('number')).toBeUndefined()
      expect(await cache.get('no-expiry')).toBeUndefined()
      expect(await cache.get('string-expiry')).toBeUndefined()
      expect(adapter.store.size).toBe(0)
    })
  })

  describe('adapter failures never throw', () => {
    it('set succeeds via memo when setItem throws; get serves from memo', async () => {
      const adapter = createMemoryAdapter({ failing: true })
      const cache = createBrowserTtlCache({ prefix: 'ff', storage: adapter })
      await cache.set('key', 'memo-truth')
      expect(await cache.get('key')).toBe('memo-truth')
      expect(adapter.calls.setItem).toBe(1)
    })

    it('get treats a throwing getItem as a miss', async () => {
      const adapter = createMemoryAdapter({ failing: true })
      const cache = createBrowserTtlCache({ prefix: 'ff', storage: adapter })
      expect(await cache.get('cold')).toBeUndefined()
    })

    it('delete, deleteAll, clear, and getAll swallow adapter failures', async () => {
      const adapter = createMemoryAdapter({ failing: true })
      const cache = createBrowserTtlCache({ prefix: 'ff', storage: adapter })
      await cache.set('key', 'value')
      await expect(cache.delete('key')).resolves.toBeUndefined()
      await cache.set('key', 'value')
      expect(await cache.getAll('*')).toEqual(new Map([['key', 'value']]))
      expect(await cache.deleteAll()).toBe(1)
      await expect(cache.clear()).resolves.toBeUndefined()
    })
  })

  describe('wildcard operations across tiers', () => {
    it('getAll merges memo and enumerated storage entries', async () => {
      const adapter = createMemoryAdapter()
      const writer = createBrowserTtlCache({ prefix: 'wa', storage: adapter })
      await writer.set('user:1', 'alice')
      await writer.set('user:2', 'bob')
      await writer.set('org:1', 'acme')
      // A fresh reader has a cold memo — entries come from enumeration.
      const reader = createBrowserTtlCache({ prefix: 'wa', storage: adapter })
      const users = await reader.getAll<string>('user:*')
      expect(new Map(users.entries())).toEqual(
        new Map([
          ['user:1', 'alice'],
          ['user:2', 'bob'],
        ]),
      )
      const all = await reader.getAll<string>('*')
      expect(all.size).toBe(3)
    })

    it('deleteAll removes matching entries from both tiers and counts distinct keys', async () => {
      const adapter = createMemoryAdapter()
      const cache = createBrowserTtlCache({ prefix: 'wd', storage: adapter })
      await cache.set('user:1', 'alice')
      await cache.set('user:2', 'bob')
      await cache.set('org:1', 'acme')
      expect(await cache.deleteAll('user:*')).toBe(2)
      expect(await cache.get('user:1')).toBeUndefined()
      expect(adapter.store.has('wd:user:1')).toBe(false)
      expect(await cache.get('org:1')).toBe('acme')
      expect(adapter.store.has('wd:org:1')).toBe(true)
    })

    it('clear empties both tiers; clear({ memoOnly: true }) keeps storage', async () => {
      const adapter = createMemoryAdapter()
      const cache = createBrowserTtlCache({ prefix: 'wc', storage: adapter })
      await cache.set('key', 'value')
      await cache.clear({ memoOnly: true })
      // Memo dropped but storage retained — the next get rehydrates.
      expect(adapter.store.has('wc:key')).toBe(true)
      expect(await cache.get('key')).toBe('value')
      await cache.clear()
      expect(adapter.store.size).toBe(0)
      expect(await cache.get('key')).toBeUndefined()
    })

    it('without keys() enumeration, wildcard ops still cover memo-visible keys in storage', async () => {
      const adapter = createMemoryAdapter({ enumerable: false })
      const cache = createBrowserTtlCache({ prefix: 'ne', storage: adapter })
      await cache.set('seen', 'in-memo')
      // A storage-only entry (previous session) is invisible to wildcard ops
      // without enumeration, but still expires per-entry on read.
      adapter.store.set(
        'ne:unseen',
        JSON.stringify({ data: 'ghost', expiresAt: Date.now() + 60_000 }),
      )
      expect(await cache.deleteAll()).toBe(1)
      expect(adapter.store.has('ne:seen')).toBe(false)
      expect(adapter.store.has('ne:unseen')).toBe(true)
      expect(await cache.get('unseen')).toBe('ghost')
    })
  })

  describe('shared storage hygiene', () => {
    it('ignores foreign keys outside the cache prefix', async () => {
      const adapter = createMemoryAdapter()
      const cache = createBrowserTtlCache({ prefix: 'mine', storage: adapter })
      adapter.store.set('other-app:key', 'foreign')
      adapter.store.set('minecraft:key', 'near-miss prefix')
      await cache.set('key', 'ours')
      expect(await cache.getAll('*')).toEqual(new Map([['key', 'ours']]))
      await cache.clear()
      expect(adapter.store.has('other-app:key')).toBe(true)
      expect(adapter.store.has('minecraft:key')).toBe(true)
    })
  })
})
