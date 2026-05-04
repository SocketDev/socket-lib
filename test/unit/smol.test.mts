/**
 * @fileoverview Unit tests for socket-btm's smol-binding feature detection.
 *
 * Mirrors sea.test.mts in shape:
 *   - isSmol() detects whether the runtime is socket-btm's smol Node binary
 *   - getSmolUtil() / getSmolPrimordial() return the binding when present
 *
 * On stock Node (the test runtime), all three return false / undefined.
 * The integration story is verified by socket-btm's own tests running
 * inside the smol binary.
 */

import { describe, expect, it } from 'vitest'

import { isSmol } from '@socketsecurity/lib/smol/detect'
import { getSmolPrimordial } from '@socketsecurity/lib/smol/primordial'
import { getSmolUtil } from '@socketsecurity/lib/smol/util'

describe('smol', () => {
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

  describe('getSmolPrimordial', () => {
    it('returns undefined on stock Node', () => {
      expect(getSmolPrimordial()).toBe(undefined)
    })

    it('is idempotent across repeated calls', () => {
      expect(getSmolPrimordial()).toBe(getSmolPrimordial())
    })

    it('does not throw', () => {
      expect(() => getSmolPrimordial()).not.toThrow()
    })
  })

  describe('cached probe semantics', () => {
    it('many calls complete quickly (cached after first)', () => {
      // Trigger probe.
      isSmol()
      getSmolUtil()
      getSmolPrimordial()
      // Subsequent calls should be cache hits, not re-probes.
      const start = performance.now()
      for (let i = 0; i < 10_000; i += 1) {
        isSmol()
        getSmolUtil()
        getSmolPrimordial()
      }
      const elapsedMs = performance.now() - start
      // 30 000 cached returns should be near-instantaneous.
      // Generous threshold to avoid CI flake.
      expect(elapsedMs).toBeLessThan(50)
    })
  })
})
