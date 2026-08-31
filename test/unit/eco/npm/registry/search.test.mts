/**
 * @file Unit tests for the npm registry search and bulk audit endpoints,
 *   including their cache paths. The HTTP adapter is injected and the cache is
 *   the in-memory browser TTL cache, so every case runs with no network and no
 *   disk.
 */

import assert from 'node:assert/strict'

import { describe, test } from 'vitest'

import { createBrowserTtlCache } from '../../../../../src/cache/ttl/browser.mjs'
import {
  buildAdvisoryQueryKey,
  fetchBulkAdvisories,
} from '../../../../../src/eco/npm/registry/audit.mjs'
import {
  nextSearchFrom,
  searchPackages,
} from '../../../../../src/eco/npm/registry/search.mjs'
import {
  countingHttp,
  failingHttp,
  recordingHttp,
  sleep,
} from './api-helpers.mjs'

const SEARCH_PAGE = {
  objects: [{ package: { name: '@example/pkg', version: '1.0.0' } }],
  time: '2026-03-24T07:35:20.725Z',
  total: 1,
}

describe('searchPackages', () => {
  test('reads a page of results', async () => {
    const stub = recordingHttp(SEARCH_PAGE)
    const read = await searchPackages({ text: 'example' }, stub)
    assert.equal(read.reachable, true)
    assert.equal(read.total, 1)
    assert.equal(read.objects[0]!.package?.name, '@example/pkg')
  })

  test('puts every parameter on the query string', async () => {
    const stub = recordingHttp(SEARCH_PAGE)
    await searchPackages({ from: 20, size: 10, text: '@example/pkg' }, stub)
    assert.equal(
      stub.calls[0]!.url,
      'https://registry.npmjs.org/-/v1/search?from=20&size=10&text=%40example%2Fpkg',
    )
  })

  test('an unreachable registry is NOT an empty result set', async () => {
    // "nothing matched" and "I could not ask" justify opposite next steps.
    const read = await searchPackages({ text: 'example' }, failingHttp())
    assert.equal(read.reachable, false)
    assert.deepEqual(read.objects, [])
  })

  test('a non-array objects field reads as empty, still reachable', async () => {
    const stub = recordingHttp({ objects: undefined, total: 0 })
    const read = await searchPackages({ text: 'example' }, stub)
    assert.equal(read.reachable, true)
    assert.deepEqual(read.objects, [])
  })

  test('cache miss then hit: the second search does not refetch', async () => {
    const cache = createBrowserTtlCache({ prefix: 'search-hit', ttl: 60_000 })
    const stub = countingHttp(SEARCH_PAGE)
    await searchPackages({ text: 'example' }, { ...stub, cache })
    await searchPackages({ text: 'example' }, { ...stub, cache })
    assert.equal(stub.state.count, 1)
  })

  test('a different page is a different cache entry', async () => {
    const cache = createBrowserTtlCache({ prefix: 'search-page', ttl: 60_000 })
    const stub = countingHttp(SEARCH_PAGE)
    await searchPackages({ from: 0, text: 'example' }, { ...stub, cache })
    await searchPackages({ from: 20, text: 'example' }, { ...stub, cache })
    assert.equal(stub.state.count, 2)
  })

  test('cache expiry: once the TTL lapses the search runs again', async () => {
    const cache = createBrowserTtlCache({ prefix: 'search-exp', ttl: 1 })
    const stub = countingHttp(SEARCH_PAGE)
    await searchPackages({ text: 'example' }, { ...stub, cache })
    await sleep(20)
    await searchPackages({ text: 'example' }, { ...stub, cache })
    assert.equal(stub.state.count, 2)
  })

  test('a failed read is never left in the cache', async () => {
    // Caching an "unreachable" verdict would hand it to every caller for the
    // whole TTL, long after the registry recovered.
    const cache = createBrowserTtlCache({ prefix: 'search-fail', ttl: 60_000 })
    const read = await searchPackages(
      { text: 'example' },
      { ...failingHttp(), cache },
    )
    assert.equal(read.reachable, false)
    const stub = countingHttp(SEARCH_PAGE)
    const retry = await searchPackages({ text: 'example' }, { ...stub, cache })
    assert.equal(retry.reachable, true)
    assert.equal(stub.state.count, 1)
  })
})

describe('nextSearchFrom', () => {
  test('advances by the number of results consumed', () => {
    const read = { objects: [{}, {}], reachable: true as const, total: 10 }
    assert.equal(nextSearchFrom({ from: 0, text: 'x' }, read), 2)
  })

  test('stops at the end of the result set', () => {
    const read = { objects: [{}, {}], reachable: true as const, total: 2 }
    assert.equal(nextSearchFrom({ from: 0, text: 'x' }, read), undefined)
  })

  test('an empty page stops, instead of re-requesting the same offset', () => {
    // The registry claiming more results while returning none is the classic
    // offset-pagination infinite loop.
    const read = { objects: [], reachable: true as const, total: 100 }
    assert.equal(nextSearchFrom({ from: 0, text: 'x' }, read), undefined)
  })

  test('an unreachable page stops rather than paging blindly on', () => {
    const read = { objects: [], reachable: false as const }
    assert.equal(nextSearchFrom({ from: 0, text: 'x' }, read), undefined)
  })

  test('a reply with no total stops', () => {
    const read = { objects: [{}], reachable: true as const }
    assert.equal(nextSearchFrom({ from: 0, text: 'x' }, read), undefined)
  })

  test('an absent from offset starts at zero', () => {
    const read = { objects: [{}, {}], reachable: true as const, total: 100 }
    assert.equal(nextSearchFrom({ text: 'example' }, read), 2)
  })
})

describe('buildAdvisoryQueryKey', () => {
  test('sorts packages and versions, so call order never splits the cache', () => {
    const a = buildAdvisoryQueryKey({ b: ['2.0.0', '1.0.0'], a: ['1.0.0'] })
    const b = buildAdvisoryQueryKey({ a: ['1.0.0'], b: ['1.0.0', '2.0.0'] })
    assert.equal(a, b)
  })

  test('a different version set is a different key', () => {
    const a = buildAdvisoryQueryKey({ a: ['1.0.0'] })
    const b = buildAdvisoryQueryKey({ a: ['1.0.1'] })
    assert.notEqual(a, b)
  })

  test('a name with no versions contributes an empty version list', () => {
    const key = buildAdvisoryQueryKey({
      'example-pkg': undefined as unknown as string[],
    })
    assert.equal(key, 'example-pkg@')
  })
})

describe('fetchBulkAdvisories', () => {
  test('POSTs the query and reads the advisories back', async () => {
    const stub = recordingHttp({
      '@example/pkg': [{ id: 100_000, severity: 'high', title: 'Bad thing' }],
    })
    const read = await fetchBulkAdvisories({ '@example/pkg': ['1.0.0'] }, stub)
    assert.equal(read.reachable, true)
    assert.equal(read.advisories['@example/pkg']?.[0]?.severity, 'high')
    assert.equal(stub.calls[0]!.method, 'POST')
    assert.equal(
      stub.calls[0]!.url,
      'https://registry.npmjs.org/-/npm/v1/security/advisories/bulk',
    )
    assert.deepEqual(JSON.parse(stub.calls[0]!.body!), {
      '@example/pkg': ['1.0.0'],
    })
  })

  test('a non-object body yields no advisories but stays reachable', async () => {
    const stub = recordingHttp('not-an-object')
    const read = await fetchBulkAdvisories({ 'example-pkg': ['1.0.0'] }, stub)
    assert.deepEqual(read.advisories, {})
    assert.equal(read.reachable, true)
  })

  test('a null body yields no advisories but stays reachable', async () => {
    // Parsed rather than written as a literal: a real adapter hands back the
    // result of JSON.parse, and a bare `null` body is what produces it.
    const stub = recordingHttp(JSON.parse('null'))
    const read = await fetchBulkAdvisories({ 'example-pkg': ['1.0.0'] }, stub)
    assert.deepEqual(read.advisories, {})
    assert.equal(read.reachable, true)
  })

  test('an empty reply with reachable:true genuinely means clean', async () => {
    const stub = recordingHttp({})
    const read = await fetchBulkAdvisories({ '@example/pkg': ['1.0.0'] }, stub)
    assert.equal(read.reachable, true)
    assert.deepEqual(read.advisories, {})
  })

  test('an unreachable registry must never read as "clean"', async () => {
    // This is the sharpest fail-open case in the client: an empty advisory
    // map is the sentence "these versions are safe to ship".
    const read = await fetchBulkAdvisories(
      { '@example/pkg': ['1.0.0'] },
      failingHttp(),
    )
    assert.equal(read.reachable, false)
    assert.deepEqual(read.advisories, {})
  })

  test('sends no authorization header when no token is given', async () => {
    // npm documents no authorization for this route, which is exactly why it
    // is the one read here that may be cached.
    const stub = recordingHttp({})
    await fetchBulkAdvisories({ '@example/pkg': ['1.0.0'] }, stub)
    assert.equal(stub.calls[0]!.headers?.['authorization'], undefined)
  })

  test('cache miss then hit: the second lookup does not refetch', async () => {
    const cache = createBrowserTtlCache({ prefix: 'adv-hit', ttl: 60_000 })
    const stub = countingHttp({})
    await fetchBulkAdvisories({ a: ['1.0.0'] }, { ...stub, cache })
    await fetchBulkAdvisories({ a: ['1.0.0'] }, { ...stub, cache })
    assert.equal(stub.state.count, 1)
  })

  test('cache expiry: once the TTL lapses the lookup runs again', async () => {
    const cache = createBrowserTtlCache({ prefix: 'adv-exp', ttl: 1 })
    const stub = countingHttp({})
    await fetchBulkAdvisories({ a: ['1.0.0'] }, { ...stub, cache })
    await sleep(20)
    await fetchBulkAdvisories({ a: ['1.0.0'] }, { ...stub, cache })
    assert.equal(stub.state.count, 2)
  })

  test('passing a token switches caching off', async () => {
    const cache = createBrowserTtlCache({ prefix: 'adv-tok', ttl: 60_000 })
    const stub = countingHttp({})
    await fetchBulkAdvisories({ a: ['1.0.0'] }, { ...stub, cache, token: 'x' })
    await fetchBulkAdvisories({ a: ['1.0.0'] }, { ...stub, cache, token: 'x' })
    assert.equal(stub.state.count, 2)
  })

  test('a failed read is never left in the cache', async () => {
    const cache = createBrowserTtlCache({ prefix: 'adv-fail', ttl: 60_000 })
    await fetchBulkAdvisories({ a: ['1.0.0'] }, { ...failingHttp(), cache })
    const stub = countingHttp({})
    const retry = await fetchBulkAdvisories(
      { a: ['1.0.0'] },
      { ...stub, cache },
    )
    assert.equal(retry.reachable, true)
    assert.equal(stub.state.count, 1)
  })
})
