/**
 * @file Unit tests for the shimmer sweep generators. Each sweep maps a frame
 *   number to a wave position; these tests verify start positions, per-frame
 *   advance, cycle wrapping, and direction dispatch.
 */

import { describe, expect, it } from 'vitest'

import {
  bidirectionalSweep,
  directionToSweep,
  ltrSweep,
  noSweep,
  randomSweep,
  rtlSweep,
} from '../../../src/effects/shimmer'
import type { ShimmerDirection } from '../../../src/effects/shimmer'

describe('effects/shimmer sweeps', () => {
  describe('ltrSweep', () => {
    it('starts at -padding (off-screen left)', () => {
      const f = ltrSweep(10, 2)
      expect(f(0)).toBe(-2)
    })

    it('advances by 1 per frame within the cycle', () => {
      const f = ltrSweep(10, 2)
      expect(f(1)).toBe(-1)
      expect(f(2)).toBe(0)
      expect(f(5)).toBe(3)
    })

    it('wraps after one full cycle (textLength + 2*padding)', () => {
      const f = ltrSweep(10, 2)
      // cycle = 14
      expect(f(0)).toBe(f(14))
      expect(f(7)).toBe(f(21))
    })

    it('handles negative frame numbers', () => {
      const f = ltrSweep(10, 2)
      expect(f(-1)).toBe(f(13))
    })
  })

  describe('rtlSweep', () => {
    it('starts at textLength + padding - 1 (off-screen right)', () => {
      const f = rtlSweep(10, 2)
      expect(f(0)).toBe(11)
    })

    it('decreases by 1 per frame', () => {
      const f = rtlSweep(10, 2)
      expect(f(1)).toBe(10)
      expect(f(11)).toBe(0)
    })

    it('wraps after one full cycle', () => {
      const f = rtlSweep(10, 2)
      // cycle = 14
      expect(f(0)).toBe(f(14))
      expect(f(7)).toBe(f(21))
    })

    it('handles negative frame numbers', () => {
      const f = rtlSweep(10, 2)
      expect(f(-1)).toBe(f(13))
    })
  })

  describe('bidirectionalSweep', () => {
    it('does LTR then RTL each cycle', () => {
      const f = bidirectionalSweep(10, 2)
      // LTR phase: frame 0..13 (cycle = 14)
      expect(f(0)).toBe(-2)
      expect(f(13)).toBe(11)
      // RTL phase: frame 14..27
      expect(f(14)).toBe(11)
      expect(f(27)).toBe(-2)
      // Wrap to LTR again
      expect(f(28)).toBe(-2)
    })

    it('wraps after one full bidirectional cycle', () => {
      const f = bidirectionalSweep(10, 2)
      // fullCycle = 28
      expect(f(0)).toBe(f(28))
      expect(f(15)).toBe(f(43))
    })

    it('handles negative frame numbers', () => {
      const f = bidirectionalSweep(10, 2)
      expect(f(-1)).toBe(f(27))
    })
  })

  describe('noSweep', () => {
    it('always returns -Infinity (wave is never on text)', () => {
      const f = noSweep()
      expect(f(0)).toBe(-Infinity)
      expect(f(100)).toBe(-Infinity)
    })
  })

  describe('randomSweep', () => {
    it('uses provided PRNG for direction at cycle boundaries', () => {
      let nextRand = 0.1 // < 0.5 → ltr
      const rng = () => nextRand
      const f = randomSweep(10, 2, rng)
      // First cycle: ltr, frame 0 should be -2
      expect(f(0)).toBe(-2)
      // Force rtl on next cycle
      nextRand = 0.9
      // Frame 14 starts a new cycle and rolls a fresh direction.
      const cyclePos = f(14)
      // RTL would start at 11; LTR at -2
      expect([11, -2]).toContain(cyclePos)
    })

    it('is deterministic given a seeded PRNG', () => {
      // Two calls with the same seeded sequence should produce identical paths.
      const seed = (s = 0x5e_ed) => {
        let state = s >>> 0
        return () => {
          state ^= state << 13
          state ^= state >>> 17
          state ^= state << 5
          state >>>= 0
          return state / 0x1_00_00_00_00
        }
      }
      const a = randomSweep(10, 2, seed())
      const b = randomSweep(10, 2, seed())
      for (let f = 0; f < 50; f++) {
        expect(a(f)).toBe(b(f))
      }
    })

    it('changes direction across cycles when PRNG dictates', () => {
      // Force ltr first, then rtl, then ltr again. Each transition should
      // be reflected at the cycle boundary (frame 14, 28).
      const seq = [0.1, 0.9, 0.1] // ltr, rtl, ltr
      let i = 0
      const f = randomSweep(10, 2, () => {
        const v = seq[Math.min(i, seq.length - 1)]!
        i++
        return v
      })
      expect(f(0)).toBe(-2) // cycle 0: ltr → -2 at start
      expect(f(14)).toBe(11) // cycle 1: rtl → 11 at start
      expect(f(28)).toBe(-2) // cycle 2: ltr → -2 again
    })
  })

  describe('directionToSweep', () => {
    const cases: Array<{ dir: ShimmerDirection; expectedKind: string }> = [
      { dir: 'ltr', expectedKind: 'ltr' },
      { dir: 'rtl', expectedKind: 'rtl' },
      { dir: 'bi', expectedKind: 'bi' },
      { dir: 'random', expectedKind: 'random' },
      { dir: 'none', expectedKind: 'none' },
    ]

    it('returns ltrSweep behavior for ltr', () => {
      const f = directionToSweep('ltr', 10, 2)
      expect(f(0)).toBe(-2) // ltrSweep starts at -padding
    })

    it('returns rtlSweep behavior for rtl', () => {
      const f = directionToSweep('rtl', 10, 2)
      expect(f(0)).toBe(11) // rtlSweep starts at textLength + padding - 1
    })

    it('returns bidirectionalSweep behavior for bi', () => {
      const f = directionToSweep('bi', 10, 2)
      expect(f(0)).toBe(-2) // first half is LTR
      expect(f(14)).toBe(11) // second half is RTL
    })

    it('returns randomSweep behavior for random', () => {
      const f = directionToSweep('random', 10, 2)
      // Random can produce either start; just verify it returns a position
      // in the valid range.
      const v = f(0)
      expect(v === -2 || v === 11).toBe(true)
    })

    it('returns noSweep behavior for none', () => {
      const f = directionToSweep('none', 10, 2)
      expect(f(0)).toBe(-Infinity)
      expect(f(100)).toBe(-Infinity)
    })

    it('falls back to ltr for unknown direction strings', () => {
      const f = directionToSweep('unknown' as ShimmerDirection, 10, 2)
      // Falls through to ltr default arm.
      expect(f(0)).toBe(-2)
    })

    it.each(cases)('handles direction $dir', ({ dir }) => {
      const f = directionToSweep(dir, 10, 2)
      expect(typeof f).toBe('function')
      expect(typeof f(0)).toBe('number')
    })
  })
})
