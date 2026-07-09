/**
 * @file Unit tests for `src/npm/meta-cache.ts`'s persisted-stale + storm-control
 *   tier: serve-stale-on-error (including the storm-cache short-circuit that
 *   serves a burst of callers without re-hitting a registry that just failed),
 *   and the standalone `getStaleMeta` / `rememberStaleMeta` / `getCachePeers`
 *   accessors. Split out of `meta-cache.test.mts` to keep each file under the
 *   fleet's 500-line soft cap — see that file for the primary TTL/force/dedupe/
 *   negative-cache coverage. HTTP is mocked via the `StubHttpAdapter` test
 *   double (no live network); cacache persistence is isolated per test via a
 *   unique `SOCKET_CACACHE_DIR`.
 */

import { describe, expect, it } from 'vitest'

import { createTtlCache } from '../../../src/cache/ttl/store'
import {
  buildMetaCacheKey,
  createNpmMetaCache,
  getCachePeers,
  getPackumentSlim,
  getStaleMeta,
  rememberStaleMeta,
} from '../../../src/npm/meta-cache'
import { tolerantSleep } from '../../_shared/fleet/lib/timing.mts'
import {
  createStubHttpAdapter,
  makeHttpResponseError,
  setupNpmMetaCacheIsolation,
} from './meta-test-helpers.mts'

import type {
  PackumentMetaSlim,
  RawPackument,
} from '../../../src/npm/meta-types'

const RAW: RawPackument = {
  'dist-tags': { latest: '1.0.0' },
  name: 'left-pad',
  time: { '1.0.0': '2024-01-01T00:00:00.000Z' },
  versions: { '1.0.0': { dist: { tarball: 'https://x/1.0.0.tgz' } } },
}

setupNpmMetaCacheIsolation('socket-test-npm-meta-cache-stale')

describe('getPackumentSlim — serve-stale-on-error', () => {
  it('serves the last known-good value when a later refresh fails', async () => {
    let succeed = true
    const http = createStubHttpAdapter(() => {
      if (succeed) {
        return RAW
      }
      throw new Error('registry unreachable')
    })
    const cache = createNpmMetaCache({
      prefix: `t-${Date.now()}-stale`,
      ttl: 1,
    })

    const good = await getPackumentSlim('left-pad', { cache, http })
    expect(good.name).toBe('left-pad')

    // Let the short TTL lapse so the next call is a genuine cache miss, then
    // make the "refresh" fail.
    await new Promise(resolve => setTimeout(resolve, tolerantSleep(20)))
    succeed = false
    const served = await getPackumentSlim('left-pad', { cache, http })
    expect(served).toEqual(good)
  })

  it('serves the storm-cached value on a subsequent call without hitting http again', async () => {
    let succeed = true
    const http = createStubHttpAdapter(() => {
      if (succeed) {
        return RAW
      }
      throw new Error('registry unreachable')
    })
    const cache = createNpmMetaCache({
      prefix: `t-${Date.now()}-storm`,
      ttl: 1,
    })

    const good = await getPackumentSlim('left-pad', { cache, http })
    await new Promise(resolve => setTimeout(resolve, tolerantSleep(20)))
    succeed = false
    await getPackumentSlim('left-pad', { cache, http })
    expect(http.calls).toHaveLength(2)

    // The storm marker was (re)written by the failed refresh above. A third
    // call within STALE_SERVE_TTL_MS is served the storm-cached value
    // directly — even though http would now succeed again — without ever
    // reaching the fetch path.
    succeed = true
    const stormed = await getPackumentSlim('left-pad', { cache, http })
    expect(stormed).toEqual(good)
    expect(http.calls).toHaveLength(2)
  })

  it('serves stale data even when the failed refresh is a fresh 404', async () => {
    let shouldFail = false
    const http = createStubHttpAdapter(() => {
      if (shouldFail) {
        throw makeHttpResponseError(404)
      }
      return RAW
    })
    const cache = createNpmMetaCache({
      prefix: `t-${Date.now()}-stale404`,
      ttl: 1,
    })

    const good = await getPackumentSlim('left-pad', { cache, http })
    await new Promise(resolve => setTimeout(resolve, tolerantSleep(20)))
    shouldFail = true
    const served = await getPackumentSlim('left-pad', { cache, http })
    expect(served).toEqual(good)
  })

  it('propagates the error when there is no stale data to fall back on', async () => {
    const http = createStubHttpAdapter(() => {
      throw new Error('registry unreachable')
    })
    const cache = createNpmMetaCache({ prefix: `t-${Date.now()}-nostale` })
    await expect(
      getPackumentSlim('never-fetched', { cache, http }),
    ).rejects.toThrow('registry unreachable')
  })
})

describe('getStaleMeta', () => {
  it('returns undefined when nothing has ever been cached for the key', async () => {
    const cache = createNpmMetaCache({ prefix: `t-${Date.now()}-stale-miss` })
    const key = buildMetaCacheKey(
      'https://registry.npmjs.org',
      'never-cached',
      'abbreviated',
    )
    expect(await getStaleMeta(cache, key)).toBeUndefined()
  })

  it('returns a cloned copy of the persisted stale value after a successful fetch', async () => {
    const http = createStubHttpAdapter(() => RAW)
    const cache = createNpmMetaCache({ prefix: `t-${Date.now()}-stale-hit` })
    const key = buildMetaCacheKey(
      'https://registry.npmjs.org',
      'left-pad',
      'abbreviated',
    )
    const meta = await getPackumentSlim('left-pad', { cache, http })
    const stale = await getStaleMeta(cache, key)
    expect(stale).toEqual(meta)
    expect(stale).not.toBe(meta)
  })
})

describe('rememberStaleMeta', () => {
  it('persists a value as the last known-good entry, readable via getStaleMeta', async () => {
    const cache = createNpmMetaCache({ prefix: `t-${Date.now()}-remember` })
    const key = buildMetaCacheKey(
      'https://registry.npmjs.org',
      'left-pad',
      'abbreviated',
    )
    const meta: PackumentMetaSlim = {
      distTags: { latest: '1.0.0' },
      lastSynced: Date.now(),
      name: 'left-pad',
      versions: {},
    }
    await rememberStaleMeta(cache, key, meta)
    const stale = await getStaleMeta(cache, key)
    expect(stale).toEqual(meta)
    expect(stale).not.toBe(meta)
  })
})

describe('getCachePeers', () => {
  it('lazily registers peers under the default prefix for a cache not created via createNpmMetaCache', () => {
    const rawCache = createTtlCache({ prefix: `t-${Date.now()}-raw` })
    const peers = getCachePeers(rawCache)
    expect(peers.stale).toBeDefined()
    expect(peers.storm).toBeDefined()
    // Registered once — a second call returns the same peers, not a fresh pair.
    expect(getCachePeers(rawCache)).toBe(peers)
  })
})
