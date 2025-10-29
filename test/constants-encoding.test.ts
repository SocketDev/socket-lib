/**
 * @fileoverview Unit tests for encoding constants.
 */

import {
  CHAR_BACKWARD_SLASH,
  CHAR_COLON,
  CHAR_FORWARD_SLASH,
  CHAR_LOWERCASE_A,
  CHAR_LOWERCASE_Z,
  CHAR_UPPERCASE_A,
  CHAR_UPPERCASE_Z,
  UTF8,
} from '@socketsecurity/lib/constants/encoding'
import { describe, expect, it } from 'vitest'

describe('constants/encoding', () => {
  describe('UTF8', () => {
    it('should be defined as utf8 string', () => {
      expect(UTF8).toBe('utf8')
    })

    it('should be a valid Node.js encoding', () => {
      // Test that it can be used with Buffer
      const buffer = Buffer.from('test', UTF8 as BufferEncoding)
      expect(buffer.toString(UTF8 as BufferEncoding)).toBe('test')
    })
  })

  describe('character codes', () => {
    it('CHAR_BACKWARD_SLASH should be 92', () => {
      expect(CHAR_BACKWARD_SLASH).toBe(92)
      expect(String.fromCharCode(CHAR_BACKWARD_SLASH)).toBe('\\')
    })

    it('CHAR_COLON should be 58', () => {
      expect(CHAR_COLON).toBe(58)
      expect(String.fromCharCode(CHAR_COLON)).toBe(':')
    })

    it('CHAR_FORWARD_SLASH should be 47', () => {
      expect(CHAR_FORWARD_SLASH).toBe(47)
      expect(String.fromCharCode(CHAR_FORWARD_SLASH)).toBe('/')
    })

    it('CHAR_LOWERCASE_A should be 97', () => {
      expect(CHAR_LOWERCASE_A).toBe(97)
      expect(String.fromCharCode(CHAR_LOWERCASE_A)).toBe('a')
    })

    it('CHAR_LOWERCASE_Z should be 122', () => {
      expect(CHAR_LOWERCASE_Z).toBe(122)
      expect(String.fromCharCode(CHAR_LOWERCASE_Z)).toBe('z')
    })

    it('CHAR_UPPERCASE_A should be 65', () => {
      expect(CHAR_UPPERCASE_A).toBe(65)
      expect(String.fromCharCode(CHAR_UPPERCASE_A)).toBe('A')
    })

    it('CHAR_UPPERCASE_Z should be 90', () => {
      expect(CHAR_UPPERCASE_Z).toBe(90)
      expect(String.fromCharCode(CHAR_UPPERCASE_Z)).toBe('Z')
    })
  })

  describe('character code ranges', () => {
    it('lowercase range should be valid', () => {
      expect(CHAR_LOWERCASE_Z).toBeGreaterThan(CHAR_LOWERCASE_A)
      expect(CHAR_LOWERCASE_Z - CHAR_LOWERCASE_A).toBe(25) // 26 letters - 1
    })

    it('uppercase range should be valid', () => {
      expect(CHAR_UPPERCASE_Z).toBeGreaterThan(CHAR_UPPERCASE_A)
      expect(CHAR_UPPERCASE_Z - CHAR_UPPERCASE_A).toBe(25) // 26 letters - 1
    })

    it('uppercase should come before lowercase in ASCII', () => {
      expect(CHAR_UPPERCASE_A).toBeLessThan(CHAR_LOWERCASE_A)
      expect(CHAR_UPPERCASE_Z).toBeLessThan(CHAR_LOWERCASE_A)
    })
  })

  describe('slash character codes', () => {
    it('forward slash should be less than backward slash', () => {
      expect(CHAR_FORWARD_SLASH).toBeLessThan(CHAR_BACKWARD_SLASH)
    })

    it('should represent actual slash characters', () => {
      expect(String.fromCharCode(CHAR_FORWARD_SLASH)).toBe('/')
      expect(String.fromCharCode(CHAR_BACKWARD_SLASH)).toBe('\\')
    })
  })

  describe('practical usage', () => {
    it('should detect lowercase letters', () => {
      const charCode = 'g'.charCodeAt(0)
      expect(charCode).toBeGreaterThanOrEqual(CHAR_LOWERCASE_A)
      expect(charCode).toBeLessThanOrEqual(CHAR_LOWERCASE_Z)
    })

    it('should detect uppercase letters', () => {
      const charCode = 'G'.charCodeAt(0)
      expect(charCode).toBeGreaterThanOrEqual(CHAR_UPPERCASE_A)
      expect(charCode).toBeLessThanOrEqual(CHAR_UPPERCASE_Z)
    })

    it('should detect path separators', () => {
      const unixPath = '/usr/local/bin'
      expect(unixPath.charCodeAt(0)).toBe(CHAR_FORWARD_SLASH)

      const windowsPath = 'C:\\Windows\\System32'
      expect(windowsPath.charCodeAt(2)).toBe(CHAR_BACKWARD_SLASH)
    })

    it('should detect colon in paths', () => {
      const windowsPath = 'C:\\Windows'
      expect(windowsPath.charCodeAt(1)).toBe(CHAR_COLON)

      const url = 'http://example.com'
      expect(url.charCodeAt(4)).toBe(CHAR_COLON)
    })
  })

  describe('type safety', () => {
    it('all character codes should be numbers', () => {
      expect(typeof CHAR_BACKWARD_SLASH).toBe('number')
      expect(typeof CHAR_COLON).toBe('number')
      expect(typeof CHAR_FORWARD_SLASH).toBe('number')
      expect(typeof CHAR_LOWERCASE_A).toBe('number')
      expect(typeof CHAR_LOWERCASE_Z).toBe('number')
      expect(typeof CHAR_UPPERCASE_A).toBe('number')
      expect(typeof CHAR_UPPERCASE_Z).toBe('number')
    })

    it('all character codes should be valid ASCII', () => {
      const codes = [
        CHAR_BACKWARD_SLASH,
        CHAR_COLON,
        CHAR_FORWARD_SLASH,
        CHAR_LOWERCASE_A,
        CHAR_LOWERCASE_Z,
        CHAR_UPPERCASE_A,
        CHAR_UPPERCASE_Z,
      ]

      for (const code of codes) {
        expect(code).toBeGreaterThanOrEqual(0)
        expect(code).toBeLessThan(128) // ASCII range
        expect(Number.isInteger(code)).toBe(true)
      }
    })

    it('UTF8 should be a string', () => {
      expect(typeof UTF8).toBe('string')
    })
  })
})
