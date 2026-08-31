/**
 * @file Specs for the browser twin of the packument cache. Deliberately
 *   self-contained: no import here touches `http-request/node` or a cacache
 *   directory, so the file exercises the same graph a web extension would get.
 *   Covers the injected-adapter fetch, the memo-only default, the structural
 *   404 path, and the Web Storage opt-in — including that a durable adapter
 *   reaches the `-stale` peer, which is what makes serve-stale-on-error
 *   survive a page reload rather than dying with the tab.
 */

import { describe, expect, it } from 'vitest'

import {
  buildMetaCacheKey,
  createNpmMetaCache,
  createWebStorageAdapter,
  createWebStorageMetaCache,
  getPackumentSlim,
  getStaleMeta,
  normalizeRegistryUrl,
  PackumentNotFoundError,
} from '../../../../src/npm/meta-cache/browser.mjs'

import type { WebStorageLike } from '../../../../src/npm/meta-cache/browser.mjs'
import type {
  NpmMetaHttpAdapter,
  RawPackument,
} from '../../../../src/npm/meta-types.mjs'

const PACKUMENT: RawPackument = {
  'dist-tags': { latest: '1.0.0' },
  name: 'left-pad',
  time: { '1.0.0': '2024-01-01T00:00:00.000Z' },
  versions: { '1.0.0': { dist: { tarball: 'https://x/1.0.0.tgz' } } },
}

interface CountingAdapter extends NpmMetaHttpAdapter {
  calls: string[]
}

/**
 * An `NpmMetaHttpAdapter` double that records URLs and answers via
 * `responder`. Local to this file rather than shared with the Node specs so
 * nothing here imports the Node HTTP module.
 */
function countingAdapter(responder: (url: string) => unknown): CountingAdapter {
  const calls: string[] = []
  return {
    calls,
    async json<T>(url: string): Promise<T> {
      calls.push(url)
      return (await responder(url)) as T
    },
  }
}

/**
 * An in-memory stand-in for `window.localStorage`, implementing the indexed
 * `key(i)` accessor so `createWebStorageAdapter`'s `keys()` has something real
 * to enumerate.
 *
 * The `null` returns below are the Web Storage spec's own miss signal, not a
 * style slip: a double that returned `undefined` would not be the thing this
 * adapter has to cope with, and the bug it is here to catch is exactly a miss
 * being mishandled.
 */
function fakeWebStorage(): WebStorageLike & { map: Map<string, string> } {
  const map = new Map<string, string>()
  return {
    get length(): number {
      return map.size
    },
    getItem(key: string): string | null {
      // oxlint-disable-next-line socket/prefer-undefined-over-null -- Web Storage returns null on a miss, by spec.
      return map.get(key) ?? null
    },
    key(index: number): string | null {
      // oxlint-disable-next-line socket/prefer-undefined-over-null -- Web Storage returns null past the end, by spec.
      return [...map.keys()][index] ?? null
    },
    map,
    removeItem(key: string): void {
      map.delete(key)
    },
    setItem(key: string, value: string): void {
      map.set(key, value)
    },
  }
}

describe('browser meta-cache fetch', () => {
  it('fetches through the injected adapter and slices the packument', async () => {
    const http = countingAdapter(() => PACKUMENT)
    const meta = await getPackumentSlim('left-pad', {
      cache: createNpmMetaCache({ prefix: 'b-fetch' }),
      http,
    })
    expect(meta.name).toBe('left-pad')
    expect(meta.distTags['latest']).toBe('1.0.0')
    expect(http.calls).toEqual(['https://registry.npmjs.org/left-pad'])
  })

  it('serves a second read from the memo tier without refetching', async () => {
    const http = countingAdapter(() => PACKUMENT)
    const cache = createNpmMetaCache({ prefix: 'b-memo' })
    await getPackumentSlim('left-pad', { cache, http })
    await getPackumentSlim('left-pad', { cache, http })
    expect(http.calls).toHaveLength(1)
  })

  it('hands back a fresh clone so callers cannot mutate the cache', async () => {
    const http = countingAdapter(() => PACKUMENT)
    const cache = createNpmMetaCache({ prefix: 'b-clone' })
    const first = await getPackumentSlim('left-pad', { cache, http })
    first.distTags['latest'] = 'tampered'
    const second = await getPackumentSlim('left-pad', { cache, http })
    expect(second.distTags['latest']).toBe('1.0.0')
  })

  it('raises PackumentNotFoundError from a structural 404, with no HttpResponseError class in reach', async () => {
    // A bare object with `status` — exactly what a fetch-based adapter throws
    // and what an `instanceof HttpResponseError` check would have missed.
    const http = countingAdapter(() => {
      throw Object.assign(new Error('Not Found'), { status: 404 })
    })
    await expect(
      getPackumentSlim('does-not-exist', {
        cache: createNpmMetaCache({ prefix: 'b-404' }),
        http,
      }),
    ).rejects.toBeInstanceOf(PackumentNotFoundError)
  })

  it('serves the persisted last known-good value when a later fetch fails', async () => {
    let fail = false
    const http = countingAdapter(() => {
      if (fail) {
        throw new Error('network down')
      }
      return PACKUMENT
    })
    const cache = createNpmMetaCache({ prefix: 'b-stale' })
    await getPackumentSlim('left-pad', { cache, http })
    fail = true
    const served = await getPackumentSlim('left-pad', {
      cache,
      force: true,
      http,
    })
    expect(served.name).toBe('left-pad')
  })
})

describe('browser meta-cache Web Storage opt-in', () => {
  it('round-trips entries through a Web Storage object', async () => {
    const storage = fakeWebStorage()
    const http = countingAdapter(() => PACKUMENT)
    const cache = createWebStorageMetaCache(storage, { prefix: 'b-ws' })
    await getPackumentSlim('left-pad', { cache, http })
    expect([...storage.map.keys()].some(k => k.startsWith('b-ws:'))).toBe(true)
  })

  it('survives a page reload — a brand new cache reads the prior entry', async () => {
    const storage = fakeWebStorage()
    const http = countingAdapter(() => PACKUMENT)
    await getPackumentSlim('left-pad', {
      cache: createWebStorageMetaCache(storage, { prefix: 'b-reload' }),
      http,
    })
    expect(http.calls).toHaveLength(1)

    // A fresh cache instance over the SAME storage is what a reload looks
    // like: the memo tier is gone, the persistent tier is not.
    const reloaded = createWebStorageMetaCache(storage, { prefix: 'b-reload' })
    const meta = await getPackumentSlim('left-pad', { cache: reloaded, http })
    expect(meta.name).toBe('left-pad')
    expect(http.calls).toHaveLength(1)
  })

  it('gives the -stale peer the storage adapter too', async () => {
    const storage = fakeWebStorage()
    const http = countingAdapter(() => PACKUMENT)
    const cache = createWebStorageMetaCache(storage, { prefix: 'b-peer' })
    await getPackumentSlim('left-pad', { cache, http })
    // Serve-stale-on-error is worthless if its tier dies with the tab, so the
    // adapter must reach the peers, not just the primary cache.
    expect(
      [...storage.map.keys()].some(k => k.startsWith('b-peer-stale:')),
    ).toBe(true)
    const key = buildMetaCacheKey(
      normalizeRegistryUrl('https://registry.npmjs.org'),
      'left-pad',
      'abbreviated',
    )
    await expect(getStaleMeta(cache, key)).resolves.toMatchObject({
      name: 'left-pad',
    })
  })

  it('degrades to memo-only when the storage adapter throws', async () => {
    const storage = fakeWebStorage()
    const exploding: WebStorageLike = {
      ...storage,
      getItem(): string | null {
        throw new Error('SecurityError')
      },
      setItem(): void {
        throw new Error('QuotaExceededError')
      },
    }
    const http = countingAdapter(() => PACKUMENT)
    const cache = createWebStorageMetaCache(exploding, { prefix: 'b-boom' })
    const meta = await getPackumentSlim('left-pad', { cache, http })
    expect(meta.name).toBe('left-pad')
  })
})

describe('createWebStorageAdapter', () => {
  it('enumerates keys via the indexed accessor', () => {
    const storage = fakeWebStorage()
    storage.setItem('a', '1')
    storage.setItem('b', '2')
    const adapter = createWebStorageAdapter(storage)
    expect(adapter.keys?.()).toEqual(['a', 'b'])
    expect(adapter.getItem('a')).toBe('1')
    adapter.removeItem('a')
    expect(adapter.getItem('a')).toBeNull()
  })
})
