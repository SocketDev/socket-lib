/**
 * @fileoverview Unit tests for src/smol/util.ts.
 *
 * Tests both responsibilities of the file:
 *   - `isSmol()` — memoized boolean detector
 *   - `getSmolUtil()` — lazy-loader for the `node:smol-util` binding
 *
 * On stock Node (the test runtime), `isSmol()` returns `false` and
 * `getSmolUtil()` returns `undefined`. The integration story is
 * verified by socket-btm's own tests running inside the smol binary.
 */

import { describe, expect, it } from 'vitest'

import { getSmolUtil, isSmol } from '@socketsecurity/lib/smol/util'

describe('smol/util', () => {
  describe('isSmol', () => {
    it('returns boolean', () => {
      const result = isSmol()
      expect(typeof result).toBe('boolean')
    })

    it('is consistent across repeated calls (memoized)', () => {
      const a = isSmol()
      const b = isSmol()
      const c = isSmol()
      expect(a).toBe(b)
      expect(b).toBe(c)
    })

    it('returns false in test environment (stock Node)', () => {
      expect(isSmol()).toBe(false)
    })

    it('does not throw', () => {
      expect(() => isSmol()).not.toThrow()
    })
  })

  describe('getSmolUtil', () => {
    it('returns undefined on stock Node', () => {
      expect(getSmolUtil()).toBe(undefined)
    })

    it('is idempotent across repeated calls', () => {
      const a = getSmolUtil()
      const b = getSmolUtil()
      expect(a).toBe(b)
    })

    it('does not throw', () => {
      expect(() => getSmolUtil()).not.toThrow()
    })
  })

  describe('cached probe semantics', () => {
    it('many calls complete quickly (cached after first)', () => {
      // Trigger probe.
      isSmol()
      getSmolUtil()
      // Subsequent calls should be cache hits, not re-probes.
      const start = performance.now()
      for (let i = 0; i < 10_000; i += 1) {
        isSmol()
        getSmolUtil()
      }
      const elapsedMs = performance.now() - start
      // 20 000 cached returns should be near-instantaneous.
      // Generous threshold to avoid CI flake.
      expect(elapsedMs).toBeLessThan(50)
    })
  })
})
