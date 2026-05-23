/**
 * @file Tests for memoize TTL-expiration + memoizeAsync dedup branches in
 *   src/memoization.ts that aren't exercised by the existing tests.
 */

import { describe, expect, it, vi } from 'vitest'

import { memoize } from '../../../src/memo/memoize'
import { memoizeAsync } from '../../../src/memo/async'

describe('memoization — extras', () => {
  describe('memoize — TTL guard + expiration', () => {
    it('throws on negative TTL', () => {
      expect(() => memoize((x: number) => x, { ttl: -1 } as never)).toThrow(
        TypeError,
      )
    })

    it('drops expired entries on next read', async () => {
      let calls = 0
      // TTL must be long enough that two synchronous calls land within the
      // window even on a slow CI runner (was 10ms — flaked on macOS-latest
      // when scheduling delay between the two `fn(1)` calls exceeded it).
      const TTL_MS = 100
      const fn = memoize(
        (x: number) => {
          calls += 1
          return x * 2
        },
        { ttl: TTL_MS } as never,
      )
      fn(1)
      fn(1)
      expect(calls).toBe(1) // hit cache
      // Wait long enough for TTL to expire even with timer-jitter.
      await new Promise(r => setTimeout(r, TTL_MS * 2 + 20))
      fn(1) // expired, recompute
      expect(calls).toBe(2)
    })
  })

  describe('memoizeAsync — stale dedup + cold dedup', () => {
    it('dedupes concurrent first-time callers (cold dedup)', async () => {
      let calls = 0
      let resolveOuter: (v: number) => void = () => {}
      const slowFn = vi.fn(async () => {
        calls += 1
        return await new Promise<number>(r => {
          resolveOuter = r
        })
      })
      const memo = memoizeAsync(slowFn)
      const p1 = memo()
      const p2 = memo()
      // Both calls should see the same in-flight promise.
      resolveOuter(42)
      const [r1, r2] = await Promise.all([p1, p2])
      expect(r1).toBe(42)
      expect(r2).toBe(42)
      expect(calls).toBe(1)
    })

    it('returns cached value on hit (no recompute)', async () => {
      let calls = 0
      const memo = memoizeAsync(async (x: number) => {
        calls += 1
        return x * 3
      })
      expect(await memo(2)).toBe(6)
      expect(await memo(2)).toBe(6)
      expect(calls).toBe(1)
    })

    it('handles function-name fallback for anonymous fns', async () => {
      const memo = memoizeAsync(async () => 'anon')
      expect(await memo()).toBe('anon')
    })
  })
})
