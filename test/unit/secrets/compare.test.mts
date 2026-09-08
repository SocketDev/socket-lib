/**
 * @file Unit tests for `compareSecrets`. Covers equality, inequality,
 *   length-mismatch handling, the string/Buffer mixed-input matrix, and
 *   native timing-safe comparisons for early and late byte mismatches.
 */

import { Buffer } from 'node:buffer'
import crypto from 'node:crypto'

import { describe, expect, it, vi } from 'vitest'

// compareSecrets is the ACTUAL under test
// (expect(compareSecrets(...)).toBe(...)), not an expected-value builder;
// it has no -stable export to import from.
// oxlint-disable-next-line socket/no-src-import-in-test-expect -- under test
import { compareSecrets } from '../../../src/secrets/compare.mjs'

describe('compareSecrets', () => {
  describe('equality', () => {
    it('returns true for two equal strings', () => {
      expect(compareSecrets('hunter2', 'hunter2')).toBe(true)
    })

    it('returns true for two equal Buffers', () => {
      expect(
        compareSecrets(Buffer.from('hunter2'), Buffer.from('hunter2')),
      ).toBe(true)
    })

    it('returns true for string + matching Buffer (mixed inputs)', () => {
      expect(compareSecrets('hunter2', Buffer.from('hunter2'))).toBe(true)
      expect(compareSecrets(Buffer.from('hunter2'), 'hunter2')).toBe(true)
    })

    it('returns true for empty inputs', () => {
      expect(compareSecrets('', '')).toBe(true)
      expect(compareSecrets(Buffer.alloc(0), Buffer.alloc(0))).toBe(true)
      expect(compareSecrets('', Buffer.alloc(0))).toBe(true)
    })

    it('handles non-ASCII UTF-8 equally', () => {
      // Smart quotes / emoji round-trip via Buffer.from(..., 'utf8') so the
      // string and Buffer forms must compare equal.
      const secret = '🔐hünt€r2'
      expect(compareSecrets(secret, secret)).toBe(true)
      expect(compareSecrets(secret, Buffer.from(secret, 'utf8'))).toBe(true)
    })
  })

  describe('inequality', () => {
    it('returns false when contents differ at the first byte', () => {
      expect(compareSecrets('hunter2', 'Aunter2')).toBe(false)
    })

    it('returns false when contents differ at the last byte', () => {
      expect(compareSecrets('hunter2', 'hunter3')).toBe(false)
    })

    it('returns false when contents differ in the middle', () => {
      expect(compareSecrets('hunter2', 'huXter2')).toBe(false)
    })

    it('returns false when only the case differs', () => {
      // Byte-level compare; the function is NOT case-insensitive.
      expect(compareSecrets('Token', 'token')).toBe(false)
    })

    it('returns false when comparing across mixed string/Buffer + different content', () => {
      expect(compareSecrets('hunter2', Buffer.from('hunter3'))).toBe(false)
    })
  })

  describe('length mismatch', () => {
    it('returns false when lengths differ (does not throw)', () => {
      // Node's timingSafeEqual throws on length mismatch by design. We catch
      // that to give callers a plain boolean — length is already observable
      // via `String.length`, so the function doesn't leak new info here.
      expect(compareSecrets('short', 'much-longer-secret')).toBe(false)
    })

    it('returns false when one side is empty', () => {
      expect(compareSecrets('', 'nonempty')).toBe(false)
      expect(compareSecrets('nonempty', '')).toBe(false)
    })

    it('returns false when lengths differ by one byte', () => {
      expect(compareSecrets('hunter2', 'hunter2!')).toBe(false)
      expect(compareSecrets('hunter2!', 'hunter2')).toBe(false)
    })

    it('returns false across Buffer length mismatch', () => {
      expect(compareSecrets(Buffer.from('abc'), Buffer.from('abcd'))).toBe(
        false,
      )
    })
  })

  describe('robustness', () => {
    it('handles binary (non-UTF-8) Buffers', () => {
      // Arbitrary bytes including invalid-UTF-8 sequences should compare
      // byte-equal regardless of decodability.
      const a = Buffer.from([0xff, 0xfe, 0x80, 0x00, 0x7f])
      const b = Buffer.from([0xff, 0xfe, 0x80, 0x00, 0x7f])
      expect(compareSecrets(a, b)).toBe(true)
    })

    it('handles binary Buffers that differ by one bit', () => {
      const a = Buffer.from([0xff, 0xfe, 0x80, 0x00, 0x7f])
      const b = Buffer.from([0xff, 0xfe, 0x80, 0x00, 0x7e])
      expect(compareSecrets(a, b)).toBe(false)
    })

    it('does not mutate either input', () => {
      const a = Buffer.from('hunter2')
      const b = Buffer.from('hunter2')
      const aBefore = a.toString('hex')
      const bBefore = b.toString('hex')
      compareSecrets(a, b)
      expect(a.toString('hex')).toBe(aBefore)
      expect(b.toString('hex')).toBe(bBefore)
    })

    it('is symmetric in its arguments', () => {
      // Property-style spot check: f(a, b) === f(b, a) for any a, b.
      const pairs: Array<[string, string]> = [
        ['hunter2', 'hunter2'],
        ['hunter2', 'hunter3'],
        ['short', 'longer'],
        ['', 'x'],
        ['', ''],
      ]
      for (const [a, b] of pairs) {
        expect(compareSecrets(a, b)).toBe(compareSecrets(b, a))
      }
    })
  })

  describe('native timing-safe comparison', () => {
    it('uses timingSafeEqual for early and late byte mismatches', () => {
      const baseline = Buffer.from('a'.repeat(1024))
      const earlyMismatch = Buffer.from('Z' + 'a'.repeat(1023))
      const lateMismatch = Buffer.from('a'.repeat(1023) + 'Z')
      const compare = vi.spyOn(crypto, 'timingSafeEqual')
      try {
        expect(compareSecrets(baseline, earlyMismatch)).toBe(false)
        expect(compareSecrets(baseline, lateMismatch)).toBe(false)
        expect(compare.mock.calls).toEqual([
          [baseline, earlyMismatch],
          [baseline, lateMismatch],
        ])
      } finally {
        compare.mockRestore()
      }
    })
  })
})
