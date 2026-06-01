/**
 * @file Unit tests for synchronous function memoization. Tests:
 *
 *   - memoize() caches synchronous function results
 *   - edge cases (large caches, nested objects, NaN/Infinity arguments)
 *
 *   Async, weak, once, decorator, and cache-clearing memoization tests live
 *   in memo-async-weak-once.test.mts. Used by Socket tools to optimize
 *   expensive operations and API calls.
 */

import { memoize } from '../../src/memo/memoize'
import { describe, expect, it, vi } from 'vitest'

describe('memoization', () => {
  describe('memoize', () => {
    it('should cache function results', () => {
      const fn = vi.fn((n: number) => n * 2)
      const memoized = memoize(fn)

      expect(memoized(5)).toBe(10)
      expect(memoized(5)).toBe(10)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should handle multiple different arguments', () => {
      const fn = vi.fn((a: number, b: number) => a + b)
      const memoized = memoize(fn)

      expect(memoized(1, 2)).toBe(3)
      expect(memoized(3, 4)).toBe(7)
      expect(memoized(1, 2)).toBe(3)
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should handle string arguments', () => {
      const fn = vi.fn((str: string) => str.toUpperCase())
      const memoized = memoize(fn)

      expect(memoized('hello')).toBe('HELLO')
      expect(memoized('world')).toBe('WORLD')
      expect(memoized('hello')).toBe('HELLO')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should handle object arguments with default keyGen', () => {
      const fn = vi.fn((obj: { x: number }) => obj.x * 2)
      const memoized = memoize(fn)

      const obj1 = { x: 5 }
      const obj2 = { x: 5 }

      expect(memoized(obj1)).toBe(10)
      expect(memoized(obj2)).toBe(10)
      // Both objects have same JSON representation, so should be cached
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should use custom keyGen when provided', () => {
      const fn = vi.fn((a: number, b: number) => a + b)
      const memoized = memoize(fn, {
        keyGen: (a, b) => `${a}-${b}`,
      })

      expect(memoized(1, 2)).toBe(3)
      expect(memoized(1, 2)).toBe(3)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should respect maxSize with LRU eviction', () => {
      const fn = vi.fn((n: number) => n * 2)
      const memoized = memoize(fn, { maxSize: 2 })

      memoized(1) // cache: [1]
      memoized(2) // cache: [1, 2]
      memoized(3) // cache: [2, 3] (1 evicted)

      expect(fn).toHaveBeenCalledTimes(3)

      memoized(2) // cache hit
      memoized(3) // cache hit
      memoized(1) // cache miss (was evicted)

      expect(fn).toHaveBeenCalledTimes(4)
    })

    it('should respect TTL expiration', async () => {
      const fn = vi.fn((n: number) => n * 2)
      // Use a large margin so slow CI (especially Windows) doesn't race the
      // wall clock: expire 100ms, sleep 500ms.
      const memoized = memoize(fn, { ttl: 100 })

      expect(memoized(5)).toBe(10)
      expect(fn).toHaveBeenCalledTimes(1)

      // Should be cached immediately
      expect(memoized(5)).toBe(10)
      expect(fn).toHaveBeenCalledTimes(1)

      // Wait well past TTL to expire
      await new Promise(resolve => setTimeout(resolve, 500))

      expect(memoized(5)).toBe(10)
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should use function name for debugging', () => {
      function myFunction(n: number) {
        return n * 2
      }
      const memoized = memoize(myFunction)

      // Just verify it doesn't throw
      expect(memoized(5)).toBe(10)
    })

    it('should use custom name when provided', () => {
      const fn = (n: number) => n * 2
      const memoized = memoize(fn, { name: 'customName' })

      // Just verify it doesn't throw
      expect(memoized(5)).toBe(10)
    })

    it('should handle zero arguments', () => {
      const fn = vi.fn(() => Math.random())
      const memoized = memoize(fn)

      const result1 = memoized()
      const result2 = memoized()

      expect(result1).toBe(result2)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should handle null and undefined arguments', () => {
      const fn = vi.fn((val: unknown) => String(val))
      const memoized = memoize(fn)

      // null and undefined produce distinct cache keys so each argument
      // gets its own cached value (prevents stale/cross-contaminated results).
      // oxlint-disable-next-line socket/prefer-undefined-over-null -- intentionally testing that null and undefined map to distinct cache keys.
      expect(memoized(null)).toBe('null')
      expect(memoized(undefined)).toBe('undefined')
      // oxlint-disable-next-line socket/prefer-undefined-over-null
      expect(memoized(null)).toBe('null')
      expect(fn).toHaveBeenCalledTimes(2)
    })

    it('should update LRU order on cache hit', () => {
      const fn = vi.fn((n: number) => n * 2)
      const memoized = memoize(fn, { maxSize: 2 })

      memoized(1) // cache: [1]
      memoized(2) // cache: [1, 2]
      memoized(1) // cache hit, moves 1 to end: [2, 1]
      memoized(3) // evicts 2, cache: [1, 3]

      expect(fn).toHaveBeenCalledTimes(3)

      memoized(1) // cache hit
      memoized(2) // cache miss (was evicted)

      expect(fn).toHaveBeenCalledTimes(4)
    })
  })

  describe('edge cases', () => {
    it('should handle very large cache sizes', () => {
      const fn = vi.fn((n: number) => n * 2)
      const memoized = memoize(fn, { maxSize: 1000 })

      for (let i = 0; i < 1000; i++) {
        memoized(i)
      }

      expect(fn).toHaveBeenCalledTimes(1000)

      // All should be cached
      for (let i = 0; i < 1000; i++) {
        memoized(i)
      }

      expect(fn).toHaveBeenCalledTimes(1000)
    })

    it('should handle complex nested objects', () => {
      const fn = vi.fn((obj: { a: { b: { c: number } } }) => obj.a.b.c * 2)
      const memoized = memoize(fn)

      const obj1 = { a: { b: { c: 5 } } }
      const obj2 = { a: { b: { c: 5 } } }

      expect(memoized(obj1)).toBe(10)
      expect(memoized(obj2)).toBe(10)

      // Same JSON representation
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should handle functions that return functions', () => {
      const fn = vi.fn((n: number) => () => n * 2)
      const memoized = memoize(fn)

      const result1 = memoized(5)
      const result2 = memoized(5)

      expect(result1).toBe(result2)
      expect(result1()).toBe(10)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should handle NaN arguments', () => {
      const fn = vi.fn((n: number) => n * 2)
      const memoized = memoize(fn)

      expect(Number.isNaN(memoized(Number.NaN))).toBe(true)
      expect(Number.isNaN(memoized(Number.NaN))).toBe(true)
      expect(fn).toHaveBeenCalledTimes(1)
    })

    it('should handle Infinity arguments', () => {
      const fn = vi.fn((n: number) => n * 2)
      const memoized = memoize(fn)

      expect(memoized(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
      expect(memoized(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
      expect(fn).toHaveBeenCalledTimes(1)
    })
  })
})
