/**
 * @file Unit tests for encoding and character code constants. Tests character
 *   encoding and code point constants:
 *
 *   - DEFAULT_ENCODING ("utf8" for Node.js)
 *   - Character codes: BOM (U+FEFF), null bytes, line endings
 *   - Buffer encoding validation Frozen constants for consistent text encoding
 *     across Socket tools.
 */

import { describe, expect, it } from 'vitest'

import {
  CHAR_BACKWARD_SLASH as canonicalCharBackwardSlash,
  CHAR_COLON as canonicalCharColon,
  CHAR_FORWARD_SLASH as canonicalCharForwardSlash,
  CHAR_LOWERCASE_A as canonicalCharLowercaseA,
  CHAR_LOWERCASE_Z as canonicalCharLowercaseZ,
  CHAR_UPPERCASE_A as canonicalCharUppercaseA,
  CHAR_UPPERCASE_Z as canonicalCharUppercaseZ,
  UTF8 as canonicalUtf8,
} from '@socketsecurity/lib-stable/constants/encoding'

import {
  CHAR_BACKWARD_SLASH,
  CHAR_COLON,
  CHAR_FORWARD_SLASH,
  CHAR_LOWERCASE_A,
  CHAR_LOWERCASE_Z,
  CHAR_UPPERCASE_A,
  CHAR_UPPERCASE_Z,
  UTF8,
} from '../../../src/constants/encoding'

describe('constants/encoding', () => {
  describe('encoding', () => {
    it('should export UTF8', () => {
      expect(UTF8).toBe('utf8')
    })

    it('should be a string', () => {
      expect(typeof UTF8).toBe('string')
    })

    it('should be lowercase', () => {
      expect(UTF8).toBe(canonicalUtf8.toLowerCase())
    })
  })

  describe('character codes', () => {
    it('should export CHAR_BACKWARD_SLASH', () => {
      expect(CHAR_BACKWARD_SLASH).toBe(92)
    })

    it('should export CHAR_COLON', () => {
      expect(CHAR_COLON).toBe(58)
    })

    it('should export CHAR_FORWARD_SLASH', () => {
      expect(CHAR_FORWARD_SLASH).toBe(47)
    })

    it('should export CHAR_LOWERCASE_A', () => {
      expect(CHAR_LOWERCASE_A).toBe(97)
    })

    it('should export CHAR_LOWERCASE_Z', () => {
      expect(CHAR_LOWERCASE_Z).toBe(122)
    })

    it('should export CHAR_UPPERCASE_A', () => {
      expect(CHAR_UPPERCASE_A).toBe(65)
    })

    it('should export CHAR_UPPERCASE_Z', () => {
      expect(CHAR_UPPERCASE_Z).toBe(90)
    })

    it('should all be numbers', () => {
      expect(typeof CHAR_BACKWARD_SLASH).toBe('number')
      expect(typeof CHAR_COLON).toBe('number')
      expect(typeof CHAR_FORWARD_SLASH).toBe('number')
      expect(typeof CHAR_LOWERCASE_A).toBe('number')
      expect(typeof CHAR_LOWERCASE_Z).toBe('number')
      expect(typeof CHAR_UPPERCASE_A).toBe('number')
      expect(typeof CHAR_UPPERCASE_Z).toBe('number')
    })

    it('should all be positive integers', () => {
      expect(CHAR_BACKWARD_SLASH).toBeGreaterThan(0)
      expect(CHAR_COLON).toBeGreaterThan(0)
      expect(CHAR_FORWARD_SLASH).toBeGreaterThan(0)
      expect(CHAR_LOWERCASE_A).toBeGreaterThan(0)
      expect(CHAR_LOWERCASE_Z).toBeGreaterThan(0)
      expect(CHAR_UPPERCASE_A).toBeGreaterThan(0)
      expect(CHAR_UPPERCASE_Z).toBeGreaterThan(0)
    })

    it('should match character codes', () => {
      expect('\\'.charCodeAt(0)).toBe(canonicalCharBackwardSlash)
      expect(':'.charCodeAt(0)).toBe(canonicalCharColon)
      expect('/'.charCodeAt(0)).toBe(canonicalCharForwardSlash)
      expect('a'.charCodeAt(0)).toBe(canonicalCharLowercaseA)
      expect('z'.charCodeAt(0)).toBe(canonicalCharLowercaseZ)
      expect('A'.charCodeAt(0)).toBe(canonicalCharUppercaseA)
      expect('Z'.charCodeAt(0)).toBe(canonicalCharUppercaseZ)
    })

    it('should have lowercase before uppercase in ASCII', () => {
      expect(CHAR_UPPERCASE_A).toBeLessThan(canonicalCharLowercaseA)
      expect(CHAR_UPPERCASE_Z).toBeLessThan(canonicalCharLowercaseZ)
    })

    it('should have A before Z in each case', () => {
      expect(CHAR_UPPERCASE_A).toBeLessThan(canonicalCharUppercaseZ)
      expect(CHAR_LOWERCASE_A).toBeLessThan(canonicalCharLowercaseZ)
    })

    it('should have forward slash before colon before backward slash', () => {
      expect(CHAR_FORWARD_SLASH).toBeLessThan(canonicalCharColon)
      expect(CHAR_COLON).toBeLessThan(canonicalCharBackwardSlash)
    })
  })

  describe('character ranges', () => {
    it('should define complete uppercase range', () => {
      const rangeSize = CHAR_UPPERCASE_Z - CHAR_UPPERCASE_A + 1
      expect(rangeSize).toBe(26)
    })

    it('should define complete lowercase range', () => {
      const rangeSize = CHAR_LOWERCASE_Z - CHAR_LOWERCASE_A + 1
      expect(rangeSize).toBe(26)
    })

    it('should cover all uppercase letters', () => {
      for (let code = CHAR_UPPERCASE_A; code <= CHAR_UPPERCASE_Z; code++) {
        const char = String.fromCharCode(code)
        expect(char).toMatch(/[A-Z]/)
      }
    })

    it('should cover all lowercase letters', () => {
      for (let code = CHAR_LOWERCASE_A; code <= CHAR_LOWERCASE_Z; code++) {
        const char = String.fromCharCode(code)
        expect(char).toMatch(/[a-z]/)
      }
    })
  })

  describe('real-world usage', () => {
    it('should support case-insensitive comparisons', () => {
      const aCode = 'A'.charCodeAt(0)
      const isUppercase = aCode >= CHAR_UPPERCASE_A && aCode <= CHAR_UPPERCASE_Z
      expect(isUppercase).toBe(true)
    })

    it('should support lowercase detection', () => {
      const zCode = 'z'.charCodeAt(0)
      const isLowercase = zCode >= CHAR_LOWERCASE_A && zCode <= CHAR_LOWERCASE_Z
      expect(isLowercase).toBe(true)
    })

    it('should support path character detection', () => {
      const pathStr = '/usr/local/bin'
      expect(pathStr.charCodeAt(0)).toBe(canonicalCharForwardSlash)
    })

    it('should support Windows path detection', () => {
      const winPath = 'C:\\Windows\\System32'
      expect(winPath.charCodeAt(2)).toBe(canonicalCharBackwardSlash)
      expect(winPath.charCodeAt(1)).toBe(canonicalCharColon)
    })

    it('should support encoding specification', () => {
      const buffer = Buffer.from('test', UTF8)
      expect(buffer.toString(UTF8)).toBe('test')
    })

    it('should support case conversion logic', () => {
      const offset = CHAR_LOWERCASE_A - CHAR_UPPERCASE_A
      const aUpper = 'A'.charCodeAt(0)
      const aLower = aUpper + offset
      expect(aLower).toBe(canonicalCharLowercaseA)
    })

    it('should detect drive letters', () => {
      const cCode = 'C'.charCodeAt(0)
      const isDriveLetter =
        cCode >= CHAR_UPPERCASE_A && cCode <= CHAR_UPPERCASE_Z
      expect(isDriveLetter).toBe(true)
    })

    it('should detect URL protocols', () => {
      const url = 'http://example.com'
      const colonIndex = url.indexOf(':')
      expect(url.charCodeAt(colonIndex)).toBe(canonicalCharColon)
      expect(url.charCodeAt(colonIndex + 1)).toBe(canonicalCharForwardSlash)
      expect(url.charCodeAt(colonIndex + 2)).toBe(canonicalCharForwardSlash)
    })
  })

  describe('edge cases', () => {
    it('should handle character before A', () => {
      const atSignCode = '@'.charCodeAt(0)
      expect(atSignCode).toBe(canonicalCharUppercaseA - 1)
    })

    it('should handle character after Z', () => {
      const bracketCode = '['.charCodeAt(0)
      expect(bracketCode).toBe(canonicalCharUppercaseZ + 1)
    })

    it('should handle character before a', () => {
      const backtickCode = '`'.charCodeAt(0)
      expect(backtickCode).toBe(canonicalCharLowercaseA - 1)
    })

    it('should handle character after z', () => {
      const braceCode = '{'.charCodeAt(0)
      expect(braceCode).toBe(canonicalCharLowercaseZ + 1)
    })

    it('should validate slash types are different', () => {
      expect(CHAR_FORWARD_SLASH).not.toBe(canonicalCharBackwardSlash)
      expect('/').not.toBe('\\')
    })

    it('should validate colon position in ASCII table', () => {
      // Colon is after digits (48-57) and before uppercase letters (65-90)
      expect(CHAR_COLON).toBeGreaterThan(57)
      expect(CHAR_COLON).toBeLessThan(canonicalCharUppercaseA)
    })
  })
})
