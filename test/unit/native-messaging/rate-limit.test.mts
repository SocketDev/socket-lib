/**
 * @file Unit tests for the native-messaging token-bucket rate limiter.
 *   Uses an injected virtual clock (`consume(key, now)`) so tests don't
 *   sleep — every refill is a clock advance.
 */

import { describe, expect, it } from 'vitest'

import { TokenBucketLimiter } from '../../../src/native-messaging/rate-limit'

describe('TokenBucketLimiter', () => {
  describe('basic admission', () => {
    it('admits the first request', () => {
      const limiter = new TokenBucketLimiter({
        capacity: 5,
        refillIntervalMs: 1000,
        maxKeys: 10,
      })
      expect(limiter.consume('key', 0)).toBe(true)
    })

    it('admits exactly capacity requests in a burst', () => {
      const limiter = new TokenBucketLimiter({
        capacity: 5,
        refillIntervalMs: 1000,
        maxKeys: 10,
      })
      for (let i = 0; i < 5; i += 1) {
        expect(limiter.consume('key', 0)).toBe(true)
      }
      // 6th request in same instant is denied.
      expect(limiter.consume('key', 0)).toBe(false)
    })

    it('denies requests when the bucket is empty', () => {
      const limiter = new TokenBucketLimiter({
        capacity: 1,
        refillIntervalMs: 1000,
        maxKeys: 10,
      })
      expect(limiter.consume('key', 0)).toBe(true)
      expect(limiter.consume('key', 0)).toBe(false)
      expect(limiter.consume('key', 0)).toBe(false)
    })
  })

  describe('refill', () => {
    it('refills one token after one interval', () => {
      const limiter = new TokenBucketLimiter({
        capacity: 3,
        refillIntervalMs: 1000,
        maxKeys: 10,
      })
      // Drain.
      expect(limiter.consume('key', 0)).toBe(true)
      expect(limiter.consume('key', 0)).toBe(true)
      expect(limiter.consume('key', 0)).toBe(true)
      expect(limiter.consume('key', 0)).toBe(false)
      // Advance 1 interval → 1 refill.
      expect(limiter.consume('key', 1000)).toBe(true)
      // Next request in same instant is denied.
      expect(limiter.consume('key', 1000)).toBe(false)
    })

    it('refills proportionally to elapsed intervals', () => {
      const limiter = new TokenBucketLimiter({
        capacity: 5,
        refillIntervalMs: 1000,
        maxKeys: 10,
      })
      // Drain.
      for (let i = 0; i < 5; i += 1) {
        limiter.consume('key', 0)
      }
      // Advance 3 intervals → 3 refills.
      expect(limiter.consume('key', 3000)).toBe(true)
      expect(limiter.consume('key', 3000)).toBe(true)
      expect(limiter.consume('key', 3000)).toBe(true)
      // 4th request in same instant exceeds the 3 refills.
      expect(limiter.consume('key', 3000)).toBe(false)
    })

    it('caps refill at capacity (no overflow)', () => {
      const limiter = new TokenBucketLimiter({
        capacity: 3,
        refillIntervalMs: 1000,
        maxKeys: 10,
      })
      limiter.consume('key', 0) // tokens: 2
      // Advance 100 intervals — but cap is 3.
      // The peek-after-consume below burns one token so peek = 3, not 4.
      expect(limiter.consume('key', 100_000)).toBe(true)
      // 3 burst requests fit (we just used one of the cap above).
      expect(limiter.consume('key', 100_000)).toBe(true)
      expect(limiter.consume('key', 100_000)).toBe(true)
      // 4th in the same instant denied — bucket capped at capacity.
      expect(limiter.consume('key', 100_000)).toBe(false)
    })

    it('does not refill from sub-interval clock advances', () => {
      const limiter = new TokenBucketLimiter({
        capacity: 1,
        refillIntervalMs: 1000,
        maxKeys: 10,
      })
      expect(limiter.consume('key', 0)).toBe(true)
      // 999ms isn't enough for one full refill interval.
      expect(limiter.consume('key', 999)).toBe(false)
      // 1000ms is.
      expect(limiter.consume('key', 1000)).toBe(true)
    })

    it('preserves partial-interval remainders across calls', () => {
      // Fractional remainders should not be lost — call A burns 600ms,
      // call B at 800ms should NOT think it's 200ms past a new refill
      // window (which would compound into a free token).
      const limiter = new TokenBucketLimiter({
        capacity: 1,
        refillIntervalMs: 1000,
        maxKeys: 10,
      })
      expect(limiter.consume('key', 0)).toBe(true)
      // Drain.
      expect(limiter.consume('key', 0)).toBe(false)
      // Probe at 600ms — no refill yet.
      expect(limiter.consume('key', 600)).toBe(false)
      // Probe at 999ms — still no refill (lastRefillAt is still 0).
      expect(limiter.consume('key', 999)).toBe(false)
      // At 1000ms, exactly one interval elapsed → one refill.
      expect(limiter.consume('key', 1000)).toBe(true)
    })
  })

  describe('per-key isolation', () => {
    it('treats keys independently', () => {
      const limiter = new TokenBucketLimiter({
        capacity: 1,
        refillIntervalMs: 1000,
        maxKeys: 10,
      })
      expect(limiter.consume('a', 0)).toBe(true)
      // Different key, fresh bucket.
      expect(limiter.consume('b', 0)).toBe(true)
      // Both now drained.
      expect(limiter.consume('a', 0)).toBe(false)
      expect(limiter.consume('b', 0)).toBe(false)
    })
  })

  describe('LRU eviction', () => {
    it('evicts the least-recently-used key when maxKeys is hit', () => {
      const limiter = new TokenBucketLimiter({
        capacity: 1,
        refillIntervalMs: 1000,
        maxKeys: 2,
      })
      limiter.consume('a', 0)
      limiter.consume('b', 0)
      // 'a' and 'b' are tracked.
      expect(limiter.size()).toBe(2)
      // Adding 'c' evicts the oldest, which is 'a'.
      limiter.consume('c', 0)
      expect(limiter.size()).toBe(2)
      expect(limiter.peek('a')).toBeUndefined()
      expect(limiter.peek('b')).toBeDefined()
      expect(limiter.peek('c')).toBeDefined()
    })

    it('promotes a touched key out of eviction order', () => {
      const limiter = new TokenBucketLimiter({
        capacity: 5,
        refillIntervalMs: 1000,
        maxKeys: 2,
      })
      limiter.consume('a', 0)
      limiter.consume('b', 0)
      // Touch 'a' — it becomes the newest.
      limiter.consume('a', 0)
      // Adding 'c' should now evict 'b' (oldest), NOT 'a'.
      limiter.consume('c', 0)
      expect(limiter.peek('a')).toBeDefined()
      expect(limiter.peek('b')).toBeUndefined()
      expect(limiter.peek('c')).toBeDefined()
    })

    it('handles single-slot capacity correctly', () => {
      const limiter = new TokenBucketLimiter({
        capacity: 1,
        refillIntervalMs: 1000,
        maxKeys: 1,
      })
      limiter.consume('a', 0)
      expect(limiter.size()).toBe(1)
      // 'b' evicts 'a' (only slot).
      limiter.consume('b', 0)
      expect(limiter.size()).toBe(1)
      expect(limiter.peek('a')).toBeUndefined()
      expect(limiter.peek('b')).toBeDefined()
    })
  })

  describe('option validation', () => {
    it('throws when capacity is zero', () => {
      expect(
        () =>
          new TokenBucketLimiter({
            capacity: 0,
            refillIntervalMs: 1000,
            maxKeys: 10,
          }),
      ).toThrow(/capacity/)
    })

    it('throws when capacity is negative', () => {
      expect(
        () =>
          new TokenBucketLimiter({
            capacity: -1,
            refillIntervalMs: 1000,
            maxKeys: 10,
          }),
      ).toThrow(/capacity/)
    })

    it('throws when refillIntervalMs is zero', () => {
      expect(
        () =>
          new TokenBucketLimiter({
            capacity: 5,
            refillIntervalMs: 0,
            maxKeys: 10,
          }),
      ).toThrow(/refillIntervalMs/)
    })

    it('throws when refillIntervalMs is negative', () => {
      expect(
        () =>
          new TokenBucketLimiter({
            capacity: 5,
            refillIntervalMs: -100,
            maxKeys: 10,
          }),
      ).toThrow(/refillIntervalMs/)
    })

    it('throws when maxKeys is zero', () => {
      expect(
        () =>
          new TokenBucketLimiter({
            capacity: 5,
            refillIntervalMs: 1000,
            maxKeys: 0,
          }),
      ).toThrow(/maxKeys/)
    })
  })

  describe('peek + size (test introspection)', () => {
    it('returns undefined for unseen keys', () => {
      const limiter = new TokenBucketLimiter({
        capacity: 5,
        refillIntervalMs: 1000,
        maxKeys: 10,
      })
      expect(limiter.peek('unseen')).toBeUndefined()
    })

    it('reports remaining tokens after partial drain', () => {
      const limiter = new TokenBucketLimiter({
        capacity: 5,
        refillIntervalMs: 1000,
        maxKeys: 10,
      })
      limiter.consume('key', 0)
      limiter.consume('key', 0)
      expect(limiter.peek('key')).toBe(3)
    })

    it('starts at zero size', () => {
      const limiter = new TokenBucketLimiter({
        capacity: 5,
        refillIntervalMs: 1000,
        maxKeys: 10,
      })
      expect(limiter.size()).toBe(0)
    })
  })
})
