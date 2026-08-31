/**
 * @file Unit tests for the npm registry API TTL caching. Uses
 *   `createBrowserTtlCache` with no storage adapter, which is a purely
 *   in-memory cache: no cacache, no disk, no network.
 */

import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { createBrowserTtlCache } from '../../../../src/cache/ttl/browser.mjs'
import {
  ADVISORY_TTL_MS,
  buildNpmCacheKey,
  readThroughCache,
  SEARCH_TTL_MS,
  selectNpmCache,
} from '../../../../src/npm/registry/cache.mjs'
import { sleep } from './api-helpers.mjs'

/**
 * A fetcher that counts its own calls, so a test can tell a cache hit from a
 * refetch without inspecting the cache.
 */
function countingFetcher(value: unknown) {
  const state = { count: 0 }
  return {
    fetcher: async () => {
      state.count += 1
      return value
    },
    state,
  }
}

describe('TTL constants', () => {
  test('advisories cache far shorter than search', () => {
    // A stale "no advisories" answer hides a live vulnerability from the
    // caller that asked in order to find it; a stale search ranking does not
    // hurt anyone.
    assert.ok(ADVISORY_TTL_MS < SEARCH_TTL_MS)
  })

  test('search matches the socket-sdk-js default of 5 minutes', () => {
    assert.equal(SEARCH_TTL_MS, 5 * 60 * 1000)
  })
})

describe('buildNpmCacheKey', () => {
  test('includes the registry, so two registries never collide', () => {
    const a = buildNpmCacheKey('https://registry.a.test', 'search', ['x'])
    const b = buildNpmCacheKey('https://registry.b.test', 'search', ['x'])
    assert.notEqual(a, b)
  })

  test('different parts produce different keys', () => {
    const a = buildNpmCacheKey('https://r.test', 'search', ['x', 10, 0])
    const b = buildNpmCacheKey('https://r.test', 'search', ['x', 10, 10])
    assert.notEqual(a, b)
  })

  test('an undefined part is stable rather than the string "undefined"', () => {
    assert.equal(
      buildNpmCacheKey('https://r.test', 'search', ['x', undefined]),
      'https://r.test:search:x:',
    )
  })
})

describe('selectNpmCache', () => {
  test('prefers the class-specific instance', () => {
    const fallback = createBrowserTtlCache({ prefix: 'fallback' })
    const search = createBrowserTtlCache({ prefix: 'search' })
    assert.equal(
      selectNpmCache({ cache: fallback, caches: { search } }, 'search'),
      search,
    )
  })

  test('falls back to the default cache when the class has none', () => {
    const fallback = createBrowserTtlCache({ prefix: 'fallback' })
    assert.equal(selectNpmCache({ cache: fallback }, 'search'), fallback)
  })

  test('answers undefined when caching was never configured', () => {
    assert.equal(selectNpmCache({}, 'search'), undefined)
  })
})

describe('readThroughCache', () => {
  test('miss then hit: the second call does not refetch', async () => {
    const cache = createBrowserTtlCache({ prefix: 'test-hit', ttl: 60_000 })
    const { fetcher, state } = countingFetcher({ v: 1 })
    const first = await readThroughCache('k', fetcher, { cache })
    const second = await readThroughCache('k', fetcher, { cache })
    assert.deepEqual(first, { v: 1 })
    assert.deepEqual(second, { v: 1 })
    assert.equal(state.count, 1)
  })

  test('expiry: once the TTL lapses the value is fetched again', async () => {
    const cache = createBrowserTtlCache({ prefix: 'test-exp', ttl: 1 })
    const { fetcher, state } = countingFetcher({ v: 1 })
    await readThroughCache('k', fetcher, { cache })
    await sleep(20)
    await readThroughCache('k', fetcher, { cache })
    assert.equal(state.count, 2)
  })

  test('distinct keys do not share an entry', async () => {
    const cache = createBrowserTtlCache({ prefix: 'test-keys', ttl: 60_000 })
    const { fetcher, state } = countingFetcher({ v: 1 })
    await readThroughCache('a', fetcher, { cache })
    await readThroughCache('b', fetcher, { cache })
    assert.equal(state.count, 2)
  })

  test('with no cache configured every call fetches', async () => {
    const { fetcher, state } = countingFetcher({ v: 1 })
    await readThroughCache('k', fetcher, {})
    await readThroughCache('k', fetcher, {})
    assert.equal(state.count, 2)
  })

  test('a token switches caching OFF, even with a cache supplied', async () => {
    // A token decides what the registry returns, so one token's answer served
    // to another is a disclosure, not a stale read. Keying by the token would
    // also mean writing a credential into a cache key, which for the Node
    // store means writing it to disk.
    const cache = createBrowserTtlCache({ prefix: 'test-tok', ttl: 60_000 })
    const { fetcher, state } = countingFetcher({ v: 1 })
    await readThroughCache('k', fetcher, { cache, token: 'tok' })
    await readThroughCache('k', fetcher, { cache, token: 'tok' })
    assert.equal(state.count, 2)
  })

  test('a token-scoped read leaves nothing behind in the cache', async () => {
    const cache = createBrowserTtlCache({ prefix: 'test-tok2', ttl: 60_000 })
    const { fetcher } = countingFetcher({ v: 1 })
    await readThroughCache('k', fetcher, { cache, token: 'tok' })
    assert.equal(await cache.get('k'), undefined)
  })

  test('an onAuth driver switches caching OFF too', async () => {
    // A driver's answer is a one-time password or a freshly minted token, so
    // the reply it bought is both credential-scoped and unrepeatable.
    const cache = createBrowserTtlCache({ prefix: 'test-auth', ttl: 60_000 })
    const { fetcher, state } = countingFetcher({ v: 1 })
    const onAuth = async () => ({ otp: '123456' })
    await readThroughCache('k', fetcher, { cache, onAuth })
    await readThroughCache('k', fetcher, { cache, onAuth })
    assert.equal(state.count, 2)
  })

  test('an onAuth-scoped read leaves nothing behind in the cache', async () => {
    const cache = createBrowserTtlCache({ prefix: 'test-auth2', ttl: 60_000 })
    const { fetcher } = countingFetcher({ v: 1 })
    await readThroughCache('k', fetcher, {
      cache,
      onAuth: async () => ({ otp: '123456' }),
    })
    assert.equal(await cache.get('k'), undefined)
  })

  test('picks the class cache when one is registered', async () => {
    const search = createBrowserTtlCache({ prefix: 'test-cls', ttl: 60_000 })
    const { fetcher, state } = countingFetcher({ v: 1 })
    await readThroughCache('k', fetcher, {
      cacheClass: 'search',
      caches: { search },
    })
    await readThroughCache('k', fetcher, {
      cacheClass: 'search',
      caches: { search },
    })
    assert.equal(state.count, 1)
  })
})
