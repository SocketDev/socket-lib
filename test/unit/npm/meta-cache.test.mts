/**
 * @file Unit tests for `src/npm/meta-cache.ts` — the cached packument fetch:
 *   accept-header selection, TTL hit/miss + `force`, in-flight dedupe via the
 *   cache's `getOrFetch`, negative (404) caching with status preservation, and
 *   serve-stale-on-error. HTTP is mocked via the `StubHttpAdapter` test double
 *   (no live network); cacache persistence is isolated per test via a unique
 *   `SOCKET_CACACHE_DIR`.
 */

import { describe, expect, it } from 'vitest'

import {
  buildMetaCacheKey,
  createNpmMetaCache,
  getDefaultMetaCache,
  getPackumentSlim,
  normalizeRegistryUrl,
  PackumentNotFoundError,
} from '../../../src/npm/meta-cache'
import { tolerantSleep } from '../../_shared/fleet/lib/timing.mts'
import {
  createDeferred,
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

setupNpmMetaCacheIsolation('socket-test-npm-meta-cache')

describe('buildMetaCacheKey', () => {
  it('joins the normalized registry, name, and variant with colons', () => {
    expect(
      buildMetaCacheKey('https://registry.npmjs.org', 'left-pad', 'full'),
    ).toBe('https://registry.npmjs.org/:left-pad:full')
  })

  it('collapses two spellings of the same registry to one key', () => {
    const withTrailingSlash = buildMetaCacheKey(
      'https://REGISTRY.npmjs.org/',
      'left-pad',
      'full',
    )
    const withoutTrailingSlash = buildMetaCacheKey(
      'https://registry.npmjs.org',
      'left-pad',
      'full',
    )
    expect(withTrailingSlash).toBe(withoutTrailingSlash)
  })
})

describe('normalizeRegistryUrl', () => {
  it('returns the input unchanged when it is not a parseable absolute URL', () => {
    expect(normalizeRegistryUrl('not a valid url')).toBe('not a valid url')
  })

  it('appends a trailing slash when the pathname does not already end with one', () => {
    expect(
      normalizeRegistryUrl('https://registry.example.com/custom/path'),
    ).toBe('https://registry.example.com/custom/path/')
  })
})

describe('getDefaultMetaCache', () => {
  it('creates the module-level default cache lazily and memoizes it thereafter', () => {
    const first = getDefaultMetaCache()
    const second = getDefaultMetaCache()
    expect(first).toBe(second)
  })
})

describe('getPackumentSlim — accept headers', () => {
  it('sends the abbreviated Accept header by default', async () => {
    const http = createStubHttpAdapter(() => RAW)
    await getPackumentSlim('left-pad', {
      cache: createNpmMetaCache({ prefix: `t-${Date.now()}-a` }),
      http,
    })
    expect(http.calls).toHaveLength(1)
    expect(http.calls[0]!.options?.headers?.['Accept']).toBe(
      'application/vnd.npm.install-v1+json; q=1.0, application/json; q=0.8, */*',
    )
  })

  it('sends the plain JSON Accept header for variant: full', async () => {
    const http = createStubHttpAdapter(() => RAW)
    await getPackumentSlim('left-pad', {
      cache: createNpmMetaCache({ prefix: `t-${Date.now()}-b` }),
      http,
      variant: 'full',
    })
    expect(http.calls[0]!.options?.headers?.['Accept']).toBe('application/json')
  })

  it('builds the request URL from the registry base + encoded name', async () => {
    const http = createStubHttpAdapter(() => RAW)
    await getPackumentSlim('@scope/pkg', {
      cache: createNpmMetaCache({ prefix: `t-${Date.now()}-c` }),
      http,
    })
    expect(http.calls[0]!.url).toBe('https://registry.npmjs.org/@scope%2Fpkg')
  })
})

describe('getPackumentSlim — bounded retries', () => {
  it('defaults retries to 2 when unset', async () => {
    const http = createStubHttpAdapter(() => RAW)
    await getPackumentSlim('left-pad', {
      cache: createNpmMetaCache({ prefix: `t-${Date.now()}-retries-default` }),
      http,
    })
    expect(http.calls[0]!.options?.retries).toBe(2)
  })

  it('caps an oversized caller-supplied retries value at 5', async () => {
    const http = createStubHttpAdapter(() => RAW)
    await getPackumentSlim('left-pad', {
      cache: createNpmMetaCache({ prefix: `t-${Date.now()}-retries-cap` }),
      http,
      retries: 999,
    })
    expect(http.calls[0]!.options?.retries).toBe(5)
  })
})

describe('getPackumentSlim — TTL hit/miss + force', () => {
  it('caches a hit — a second call within the TTL makes no new request', async () => {
    const http = createStubHttpAdapter(() => RAW)
    const cache = createNpmMetaCache({
      prefix: `t-${Date.now()}-d`,
      ttl: 60_000,
    })
    await getPackumentSlim('left-pad', { cache, http })
    await getPackumentSlim('left-pad', { cache, http })
    expect(http.calls).toHaveLength(1)
  })

  it('misses and refetches once the TTL expires', async () => {
    const http = createStubHttpAdapter(() => RAW)
    const cache = createNpmMetaCache({ prefix: `t-${Date.now()}-e`, ttl: 1 })
    await getPackumentSlim('left-pad', { cache, http })
    await new Promise(resolve => setTimeout(resolve, tolerantSleep(20)))
    await getPackumentSlim('left-pad', { cache, http })
    expect(http.calls).toHaveLength(2)
  })

  it('force refetches a cached entry older than the 30s coalescing window', async () => {
    const http = createStubHttpAdapter(() => RAW)
    const cache = createNpmMetaCache({
      prefix: `t-${Date.now()}-f`,
      ttl: 60_000,
    })
    const key = buildMetaCacheKey(
      'https://registry.npmjs.org',
      'left-pad',
      'abbreviated',
    )
    await getPackumentSlim('left-pad', { cache, http })
    const cached = (await cache.get(key)) as { meta: unknown }
    // Backdate the cached entry past the 30s force-coalescing window.
    await cache.set(key, {
      cachedAt: Date.now() - 31_000,
      kind: 'hit',
      meta: cached.meta,
    })
    await getPackumentSlim('left-pad', { cache, force: true, http })
    expect(http.calls).toHaveLength(2)
  })

  it('force serves a just-cached entry (younger than 30s) without refetching', async () => {
    const http = createStubHttpAdapter(() => RAW)
    const cache = createNpmMetaCache({
      prefix: `t-${Date.now()}-g`,
      ttl: 60_000,
    })
    await getPackumentSlim('left-pad', { cache, http })
    await getPackumentSlim('left-pad', { cache, force: true, http })
    expect(http.calls).toHaveLength(1)
  })

  it('force serves the persisted stale value when the forced refetch fails', async () => {
    let succeed = true
    const http = createStubHttpAdapter(() => {
      if (succeed) {
        return RAW
      }
      throw new Error('registry unreachable')
    })
    const cache = createNpmMetaCache({
      prefix: `t-${Date.now()}-force-stale`,
      ttl: 60_000,
    })
    const key = buildMetaCacheKey(
      'https://registry.npmjs.org',
      'left-pad',
      'abbreviated',
    )
    const good = await getPackumentSlim('left-pad', { cache, http })
    const cached = (await cache.get(key)) as { meta: unknown }
    // Backdate past the 30s force-coalescing window so force attempts a real
    // refetch instead of serving the just-cached hit.
    await cache.set(key, {
      cachedAt: Date.now() - 31_000,
      kind: 'hit',
      meta: cached.meta,
    })
    succeed = false
    const served = await getPackumentSlim('left-pad', {
      cache,
      force: true,
      http,
    })
    expect(served).toEqual(good)
  })

  it('force rethrows when there is no stale data to fall back on', async () => {
    const http = createStubHttpAdapter(() => {
      throw new Error('registry unreachable')
    })
    const cache = createNpmMetaCache({
      prefix: `t-${Date.now()}-force-nostale`,
    })
    await expect(
      getPackumentSlim('never-fetched', { cache, force: true, http }),
    ).rejects.toThrow('registry unreachable')
  })

  it('force throws PackumentNotFoundError on a fresh 404 with no stale data', async () => {
    const http = createStubHttpAdapter(() => {
      throw makeHttpResponseError(404)
    })
    const cache = createNpmMetaCache({ prefix: `t-${Date.now()}-force-404` })
    await expect(
      getPackumentSlim('no-such-pkg', { cache, force: true, http }),
    ).rejects.toBeInstanceOf(PackumentNotFoundError)
  })
})

describe('getPackumentSlim — in-flight dedupe', () => {
  it('two concurrent calls for the same key make exactly one HTTP request', async () => {
    const deferred = createDeferred<RawPackument>()
    let requestCount = 0
    const http = createStubHttpAdapter(() => {
      requestCount += 1
      return deferred.promise
    })
    const cache = createNpmMetaCache({
      prefix: `t-${Date.now()}-h`,
      ttl: 60_000,
    })

    const p1 = getPackumentSlim('left-pad', { cache, http })
    const p2 = getPackumentSlim('left-pad', { cache, http })
    // Let both callers reach the cache's inflight registration before resolving.
    await Promise.resolve()
    await Promise.resolve()
    deferred.resolve(RAW)
    const [r1, r2] = await Promise.all([p1, p2])

    expect(requestCount).toBe(1)
    expect(r1.name).toBe('left-pad')
    expect(r2.name).toBe('left-pad')
  })

  it('does not dedupe requests for different variants', async () => {
    const http = createStubHttpAdapter(() => RAW)
    const cache = createNpmMetaCache({
      prefix: `t-${Date.now()}-i`,
      ttl: 60_000,
    })
    await Promise.all([
      getPackumentSlim('left-pad', { cache, http, variant: 'abbreviated' }),
      getPackumentSlim('left-pad', { cache, http, variant: 'full' }),
    ])
    expect(http.calls).toHaveLength(2)
  })
})

describe('getPackumentSlim — negative (404) caching', () => {
  it('caches a definitive 404 and preserves the status across a replay', async () => {
    const http = createStubHttpAdapter(() => {
      throw makeHttpResponseError(404, 'Not Found')
    })
    const cache = createNpmMetaCache({ prefix: `t-${Date.now()}-404a` })

    await expect(
      getPackumentSlim('no-such-pkg', { cache, http }),
    ).rejects.toMatchObject({ status: 404 })

    // A replay within the negative-TTL window must not call http again, and
    // must still report status 404 — never mutate to a different code.
    await expect(
      getPackumentSlim('no-such-pkg', { cache, http }),
    ).rejects.toMatchObject({ status: 404 })
    expect(http.calls).toHaveLength(1)
  })

  it('throws a PackumentNotFoundError instance for a 404', async () => {
    const http = createStubHttpAdapter(() => {
      throw makeHttpResponseError(404)
    })
    const cache = createNpmMetaCache({ prefix: `t-${Date.now()}-404b` })
    await expect(
      getPackumentSlim('no-such-pkg', { cache, http }),
    ).rejects.toBeInstanceOf(PackumentNotFoundError)
  })

  it('never negative-caches a transient (non-404) error', async () => {
    let attempts = 0
    const http = createStubHttpAdapter(() => {
      attempts += 1
      throw new Error('ECONNRESET')
    })
    const cache = createNpmMetaCache({ prefix: `t-${Date.now()}-transient` })

    await expect(
      getPackumentSlim('flaky-pkg', { cache, http }),
    ).rejects.toThrow('ECONNRESET')
    await expect(
      getPackumentSlim('flaky-pkg', { cache, http }),
    ).rejects.toThrow('ECONNRESET')
    // Every call hit the network — nothing was cached as a false negative.
    expect(attempts).toBe(2)
  })

  it('ages out a negative-cache entry and refetches once NEGATIVE_TTL_MS elapses', async () => {
    let calls = 0
    const http = createStubHttpAdapter(() => {
      calls += 1
      throw makeHttpResponseError(404)
    })
    const cache = createNpmMetaCache({ prefix: `t-${Date.now()}-404-expire` })
    const key = buildMetaCacheKey(
      'https://registry.npmjs.org',
      'no-such-pkg',
      'abbreviated',
    )

    await expect(
      getPackumentSlim('no-such-pkg', { cache, http }),
    ).rejects.toMatchObject({ status: 404 })
    expect(calls).toBe(1)

    // Backdate the miss entry past the 45s NEGATIVE_TTL_MS window so it's
    // treated as aged-out rather than a within-window cached miss.
    const missEntry = await cache.get(key)
    await cache.set(key, {
      ...(missEntry as Record<string, unknown>),
      cachedAt: Date.now() - 46_000,
    })

    await expect(
      getPackumentSlim('no-such-pkg', { cache, http }),
    ).rejects.toMatchObject({ status: 404 })
    expect(calls).toBe(2)
  })
})

describe('getPackumentSlim — dist-less (ancient) version', () => {
  it('does not crash when a version has no dist block at all', async () => {
    const raw: RawPackument = {
      'dist-tags': { latest: '0.0.1' },
      name: 'ancient-pkg',
      time: { '0.0.1': '2011-01-01T00:00:00.000Z' },
      versions: { '0.0.1': {} },
    }
    const http = createStubHttpAdapter(() => raw)
    const cache = createNpmMetaCache({ prefix: `t-${Date.now()}-ancient` })
    const meta = await getPackumentSlim('ancient-pkg', { cache, http })
    expect(meta.versions['0.0.1']).toEqual({
      time: '2011-01-01T00:00:00.000Z',
    })
  })
})

describe('getPackumentSlim — default cache and http adapter', () => {
  it('falls back to the default cache and the default http adapter when neither is provided', async () => {
    const cache = getDefaultMetaCache()
    const key = buildMetaCacheKey(
      'https://registry.npmjs.org',
      'default-fallback-pkg',
      'abbreviated',
    )
    const meta: PackumentMetaSlim = {
      distTags: { latest: '1.0.0' },
      lastSynced: Date.now(),
      name: 'default-fallback-pkg',
      versions: {},
    }
    // Pre-populate the default cache with a fresh hit so the call below is
    // served from cache — proving the fallback wiring without a real fetch.
    await cache.set(key, { cachedAt: Date.now(), kind: 'hit', meta })
    const result = await getPackumentSlim('default-fallback-pkg')
    expect(result).toEqual(meta)
  })
})
