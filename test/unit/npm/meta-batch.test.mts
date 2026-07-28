/**
 * @file Unit tests for `src/npm/meta.ts`'s `getBatch` (order preservation,
 *   per-item errors, bounded concurrency, `throwOnError`) and
 *   `getVersionTrustInfo` (forced `variant: 'full'`, `_npmUser` mapping). HTTP
 *   is mocked via `StubHttpAdapter` (no live network); cacache persistence is
 *   isolated per test via a unique `SOCKET_CACACHE_DIR`.
 */

import { describe, expect, it } from 'vitest'

import { getBatch, getVersionTrustInfo } from '../../../src/npm/meta'
import {
  tolerantSleep,
  tolerantTimeout,
} from '../../_shared/fleet/lib/timing.mts'
import {
  createStubHttpAdapter,
  freshCache,
  setupNpmMetaCacheIsolation,
} from './meta-test-helpers.mts'

import type { PackumentMetaSlim } from '../../../src/npm/meta-types'
import type { RawPackument } from '../../../src/npm/meta-types'

const RAW: RawPackument = {
  'dist-tags': { latest: '1.0.0' },
  name: 'widget',
  time: { '1.0.0': '2024-01-01T00:00:00.000Z' },
  versions: { '1.0.0': { dist: {} } },
}

async function waitFor(
  predicate: () => boolean,
  timeoutMs: number,
): Promise<void> {
  const deadline = Date.now() + timeoutMs
  while (!predicate()) {
    if (Date.now() > deadline) {
      throw new Error('waitFor: timed out')
    }
    await new Promise(resolve => setTimeout(resolve, tolerantSleep(5)))
  }
}

/**
 * Release every currently-queued resolver, then give the scheduler a real
 * timer tick to let the next chunk queue up, repeating until `done` settles.
 * A single microtask isn't enough here — `pEach`'s per-item `pRetry`
 * wrapping needs genuine event-loop turns to advance to the next chunk.
 */
async function drainConcurrencyTracker(
  resolvers: Array<() => void>,
  done: Promise<unknown>,
): Promise<void> {
  let finished = false
  done.then(
    () => {
      finished = true
    },
    () => {
      finished = true
    },
  )
  while (!finished) {
    while (resolvers.length > 0) {
      resolvers.shift()!()
    }
    await new Promise(resolve => setTimeout(resolve, tolerantSleep(5)))
  }
}

/**
 * Build an `NpmMetaHttpAdapter` test double that tracks the LIVE in-flight
 * call count (not just "how many started") — `getMax()` reports the true
 * high-water mark, so a concurrency-bound assertion can't pass just because
 * enough calls eventually started.
 */
function createConcurrencyTrackingAdapter() {
  let inFlight = 0
  let max = 0
  const resolvers: Array<() => void> = []
  const http = createStubHttpAdapter(
    () =>
      new Promise(resolve => {
        inFlight += 1
        max = Math.max(max, inFlight)
        resolvers.push(() => {
          inFlight -= 1
          resolve(RAW)
        })
      }),
  )
  return { getMax: () => max, http, resolvers }
}

setupNpmMetaCacheIsolation('socket-test-npm-meta-batch')

describe('getBatch', () => {
  it('returns an index-preserving array of results', async () => {
    const http = createStubHttpAdapter(() => RAW)
    const results = await getBatch(['a', 'b', 'c'], {
      cache: freshCache('order'),
      http,
    })
    expect(results).toHaveLength(3)
    for (const result of results) {
      expect((result as PackumentMetaSlim).name).toBe('widget')
    }
  })

  it('captures a per-item failure as a PackageError at its original index', async () => {
    const http = createStubHttpAdapter(url => {
      if (url.includes('bad')) {
        throw new Error('boom')
      }
      return RAW
    })
    const results = await getBatch(['good1', 'bad', 'good2'], {
      cache: freshCache('errors'),
      http,
    })
    expect((results[0] as PackumentMetaSlim).name).toBe('widget')
    expect(results[1]).toEqual({
      error: 'boom',
      name: 'bad',
      status: undefined,
    })
    expect((results[2] as PackumentMetaSlim).name).toBe('widget')
  })

  it(
    'throwOnError rethrows the first failure after every item settles',
    async () => {
      let started = 0
      const http = createStubHttpAdapter(url => {
        started += 1
        if (url.includes('bad')) {
          throw new Error('boom')
        }
        return RAW
      })
      await expect(
        getBatch(['good1', 'bad', 'good2'], {
          cache: freshCache('throw'),
          http,
          throwOnError: true,
        }),
      ).rejects.toThrow('boom')
      expect(started).toBe(3)
    },
    tolerantTimeout(5000),
  )

  it(
    'throwOnError throws the LOWEST-INDEX failure deterministically, even when a later index settles first',
    async () => {
      // "slow-bad" (index 1) rejects AFTER "fast-bad" (index 3) — a
      // settle-order "first error wins" implementation reports fast-bad's
      // error; the lowest-index contract must report slow-bad's.
      const http = createStubHttpAdapter(async url => {
        if (url.includes('slow-bad')) {
          await new Promise(resolve => setTimeout(resolve, tolerantSleep(20)))
          throw new Error('slow-bad failure')
        }
        if (url.includes('fast-bad')) {
          throw new Error('fast-bad failure')
        }
        return RAW
      })
      await expect(
        getBatch(['good0', 'slow-bad', 'good2', 'fast-bad'], {
          cache: freshCache('lowest-index'),
          http,
          throwOnError: true,
        }),
      ).rejects.toThrow('slow-bad failure')
    },
    tolerantTimeout(5000),
  )

  it(
    'bounds concurrency to the configured window',
    async () => {
      const names = ['a', 'b', 'c', 'd', 'e']
      let started = 0
      const resolvers: Array<() => void> = []
      const http = createStubHttpAdapter(
        () =>
          new Promise(resolve => {
            started += 1
            resolvers.push(() => resolve(RAW))
          }),
      )
      const promise = getBatch(names, {
        cache: freshCache('concurrency'),
        concurrency: 2,
        http,
      })

      await waitFor(() => started >= 2, tolerantTimeout(2000))
      expect(started).toBe(2)

      resolvers.shift()!()
      resolvers.shift()!()
      await waitFor(() => started >= 4, tolerantTimeout(2000))
      expect(started).toBe(4)

      resolvers.shift()!()
      resolvers.shift()!()
      await waitFor(() => started >= 5, tolerantTimeout(2000))
      expect(started).toBe(5)

      resolvers.shift()!()
      await promise
    },
    tolerantTimeout(5000),
  )

  it(
    'pins the default concurrency at exactly 8 — a real high-water-mark, not just a result-length check',
    async () => {
      const names = Array.from({ length: 20 }, (_v, index) => `pkg-${index}`)
      const tracker = createConcurrencyTrackingAdapter()
      const promise = getBatch(names, {
        cache: freshCache('default-pin'),
        http: tracker.http,
      })

      await waitFor(() => tracker.resolvers.length >= 8, tolerantTimeout(2000))
      // Give any over-eager scheduling a chance to start more than 8 before
      // asserting the ceiling held.
      await new Promise(resolve => setTimeout(resolve, tolerantSleep(20)))
      expect(tracker.getMax()).toBe(8)

      await drainConcurrencyTracker(tracker.resolvers, promise)
      await promise
    },
    tolerantTimeout(10_000),
  )

  it(
    'pins a custom concurrency at exactly that value',
    async () => {
      const names = Array.from({ length: 20 }, (_v, index) => `pkg-${index}`)
      const tracker = createConcurrencyTrackingAdapter()
      const promise = getBatch(names, {
        cache: freshCache('custom-pin'),
        concurrency: 3,
        http: tracker.http,
      })

      await waitFor(() => tracker.resolvers.length >= 3, tolerantTimeout(2000))
      await new Promise(resolve => setTimeout(resolve, tolerantSleep(20)))
      expect(tracker.getMax()).toBe(3)

      await drainConcurrencyTracker(tracker.resolvers, promise)
      await promise
    },
    tolerantTimeout(10_000),
  )
})

describe('getVersionTrustInfo', () => {
  it("forces variant: 'full' regardless of the caller-supplied variant", async () => {
    const http = createStubHttpAdapter(() => RAW)
    await getVersionTrustInfo('widget', {
      cache: freshCache('force-full'),
      http,
      variant: 'abbreviated',
    })
    expect(http.calls[0]!.options?.headers?.['Accept']).toBe('application/json')
  })

  it('maps _npmUser + dist fields to VersionTrustInfo per version', async () => {
    const raw: RawPackument = {
      'dist-tags': { latest: '1.0.0' },
      name: 'widget',
      time: { '1.0.0': '2024-01-01T00:00:00.000Z' },
      versions: {
        '1.0.0': {
          _npmUser: { approver: { name: 'alice' }, trustedPublisher: true },
          dist: {
            attestations: { url: 'https://x' },
            integrity: 'sha512-x',
            shasum: 'abc',
          },
        },
      },
    }
    const result = await getVersionTrustInfo('widget', {
      cache: freshCache('map'),
      http: createStubHttpAdapter(() => raw),
    })
    expect(result['1.0.0']).toEqual({
      approver: true,
      attestations: { url: 'https://x' },
      integrity: 'sha512-x',
      shasum: 'abc',
      trustedPublisher: true,
    })
  })
})
