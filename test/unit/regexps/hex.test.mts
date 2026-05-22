/**
 * @file Unit tests for hex-encoding helpers used by the spec-compliant
 *   `RegExp.escape` fallback.
 */

import { describe, expect, it } from 'vitest'

import { hex2, hex4 } from '../../../src/regexps/hex'

describe('regexps/hex', () => {
  describe('hex2', () => {
    it('pads single-digit values to two chars', () => {
      expect(hex2(0)).toBe('00')
      expect(hex2(1)).toBe('01')
      expect(hex2(0x0a)).toBe('0a')
      expect(hex2(0x0f)).toBe('0f')
    })

    it('returns two chars for typical byte values', () => {
      expect(hex2(0x10)).toBe('10')
      expect(hex2(0x7f)).toBe('7f')
      expect(hex2(0xff)).toBe('ff')
    })

    it('uses lowercase hex digits', () => {
      expect(hex2(0xab)).toBe('ab')
      expect(hex2(0xcd)).toBe('cd')
    })
  })

  describe('hex4', () => {
    it('pads to four chars', () => {
      expect(hex4(0)).toBe('0000')
      expect(hex4(0xa)).toBe('000a')
      expect(hex4(0xff)).toBe('00ff')
    })

    it('returns four chars for typical 16-bit values', () => {
      expect(hex4(0x100)).toBe('0100')
      expect(hex4(0xabcd)).toBe('abcd')
      expect(hex4(0xffff)).toBe('ffff')
    })
  })
})
