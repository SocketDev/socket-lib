/**
 * @file Unit tests for string utility edge cases (part 1). Split from
 *   strings.test.mts to stay under the file-line cap. Covers boundary
 *   conditions for applyLinePrefix(), indentString(), search(), trimNewlines(),
 *   toKebabCase(), stringWidth(), centerText(), repeatString(),
 *   isBlankString(), and fromCharCode().
 */

import {
  applyLinePrefix,
  centerText,
  fromCharCode,
  indentString,
  repeatString,
} from '../../src/strings/format'
import { isBlankString } from '../../src/strings/predicates'
import { search } from '../../src/strings/search'
import { toKebabCase, trimNewlines } from '../../src/strings/transform'
import { stringWidth } from '../../src/strings/width'
import { describe, expect, it } from 'vitest'

describe('strings edge cases (part 1)', () => {
  describe('applyLinePrefix edge cases', () => {
    it('should handle multiple consecutive newlines', () => {
      const result = applyLinePrefix('a\n\n\nb', { prefix: '> ' })
      expect(result).toBe('> a\n> \n> \n> b')
    })

    it('should handle trailing newline', () => {
      const result = applyLinePrefix('hello\n', { prefix: '> ' })
      expect(result).toBe('> hello\n> ')
    })

    it('should handle only newlines', () => {
      const result = applyLinePrefix('\n\n', { prefix: '> ' })
      expect(result).toBe('> \n> \n> ')
    })
  })

  describe('indentString edge cases', () => {
    it('should handle count of 0', () => {
      expect(indentString('hello', { count: 0 })).toBe('hello')
    })

    it('should throw on negative count', () => {
      expect(() => indentString('hello', { count: -5 })).toThrow(RangeError)
    })

    it('should handle large count', () => {
      const result = indentString('hi', { count: 100 })
      expect(result).toMatch(/^\s{100}hi$/)
    })

    it('should handle whitespace-only lines correctly', () => {
      const result = indentString('a\n   \nb', { count: 2 })
      expect(result).toBe('  a\n   \n  b')
    })
  })

  describe('search edge cases', () => {
    it('should handle fromIndex at exact match position', () => {
      expect(search('hello', /hello/, { fromIndex: 0 })).toBe(0)
    })

    it('should handle fromIndex past all matches', () => {
      expect(search('hello world', /hello/, { fromIndex: 10 })).toBe(-1)
    })

    it('should handle very negative fromIndex', () => {
      expect(search('hello', /hello/, { fromIndex: -1000 })).toBe(0)
    })

    it('should handle regex with flags', () => {
      expect(search('Hello', /hello/i)).toBe(0)
    })

    it('should handle global regex', () => {
      expect(search('test test', /test/g, { fromIndex: 5 })).toBe(5)
    })
  })

  describe('trimNewlines edge cases', () => {
    it('should handle single character', () => {
      expect(trimNewlines('a')).toBe('a')
      expect(trimNewlines('\n')).toBe('')
      expect(trimNewlines('\r')).toBe('')
    })

    it('should handle mixed line endings', () => {
      expect(trimNewlines('\r\n\nhello\n\r\n')).toBe('hello')
    })

    it('should handle only carriage returns', () => {
      expect(trimNewlines('\r\r\r')).toBe('')
    })

    it('should handle very long strings with newlines', () => {
      const content = 'a'.repeat(1000)
      const input = `\n\n${content}\n\n`
      expect(trimNewlines(input)).toBe(content)
    })
  })

  describe('toKebabCase edge cases', () => {
    it('should handle multiple underscores', () => {
      expect(toKebabCase('foo___bar')).toBe('foo---bar')
    })

    it('should handle trailing underscore', () => {
      expect(toKebabCase('foo_')).toBe('foo-')
    })

    it('should handle leading underscore', () => {
      expect(toKebabCase('_foo')).toBe('-foo')
    })

    it('should handle numbers at end', () => {
      expect(toKebabCase('test123')).toBe('test123')
    })

    it('should handle mixed everything', () => {
      expect(toKebabCase('get_HTML5_Document')).toBe('get-html5-document')
    })

    it('should handle empty string early return', () => {
      // Tests line 731: if (!str.length)
      const result = toKebabCase('')
      expect(result).toBe('')
    })
  })

  describe('search additional edge cases', () => {
    it('should return -1 when fromIndex >= length', () => {
      // Tests line 311-312: if (fromIndex >= length)
      const result = search('hello', /l/, { fromIndex: 10 })
      expect(result).toBe(-1)
    })

    it('should use fast path when fromIndex === 0', () => {
      // Tests line 314-315: if (fromIndex === 0)
      const result = search('hello world', /world/, { fromIndex: 0 })
      expect(result).toBe(6)
    })
  })

  describe('stringWidth edge cases', () => {
    it('should return 0 for non-string input', () => {
      // Tests line 546-547: typeof check and !text.length
      expect(stringWidth(undefined as unknown as string)).toBe(0)
      expect(stringWidth(undefined as unknown as string)).toBe(0)
      // @ts-expect-error - Testing runtime behavior with invalid argument type
      expect(stringWidth(123)).toBe(0)
    })

    it('should return 0 for empty string', () => {
      // Tests line 546-547
      expect(stringWidth('')).toBe(0)
    })

    it('should return 0 for string with only ANSI codes', () => {
      // Tests line 555-556: plainText.length check
      expect(stringWidth('\x1b[31m\x1b[0m')).toBe(0)
    })

    it('should skip zero-width clusters', () => {
      // Tests line 604-605: zeroWidthClusterRegex
      expect(stringWidth('hello\u200Bworld')).toBe(10) // Zero-width space
      expect(stringWidth('test\t')).toBe(4) // Tab is control char
    })

    it('should handle RGI emoji as double-width', () => {
      // Tests line 623-625: emojiRegex
      expect(stringWidth('👍')).toBeGreaterThanOrEqual(2)
      expect(stringWidth('😀')).toBeGreaterThanOrEqual(2)
    })

    it('should use East Asian Width for non-emoji', () => {
      // Tests line 639-640: baseSegment and codePointAt
      expect(stringWidth('漢')).toBeGreaterThanOrEqual(2) // CJK
      expect(stringWidth('ｱ')).toBe(1) // Halfwidth Katakana
    })

    it('should handle trailing halfwidth/fullwidth forms', () => {
      // Tests line 678-690: segment.length > 1 and charCode checks
      const textWithHalfwidth = 'aﾞ' // 'a' + halfwidth dakuten
      expect(stringWidth(textWithHalfwidth)).toBeGreaterThanOrEqual(1)
    })
  })

  describe('trimNewlines comprehensive edge cases', () => {
    it('should return empty string for length 0', () => {
      // Tests line 780-781: if (length === 0)
      expect(trimNewlines('')).toBe('')
    })

    it('should handle single newline character', () => {
      // Tests line 785-786: if (length === 1) with newline
      expect(trimNewlines('\n')).toBe('')
      expect(trimNewlines('\r')).toBe('')
    })

    it('should handle single non-newline character', () => {
      // Tests line 785-786: if (length === 1) with non-newline
      expect(trimNewlines('a')).toBe('a')
    })

    it('should return original if no edge newlines', () => {
      // Tests line 790-791: noFirstNewline && noLastNewline
      expect(trimNewlines('hello')).toBe('hello')
      expect(trimNewlines('a\nb')).toBe('a\nb')
    })

    it('should handle newlines at start', () => {
      // Tests line 795-800: while loop for start
      expect(trimNewlines('\n\r\nhello')).toBe('hello')
    })

    it('should handle newlines at end', () => {
      // Tests line 802-807: while loop for end
      expect(trimNewlines('hello\r\n\n')).toBe('hello')
    })

    it('should handle newlines at both ends', () => {
      // Tests both loops
      expect(trimNewlines('\r\n\rhello\n\r')).toBe('hello')
    })
  })

  describe('centerText edge cases', () => {
    it('should return original text when >= width', () => {
      // Tests line 882: if (textLength >= width)
      expect(centerText('hello', 5)).toBe('hello')
      expect(centerText('hello', 3)).toBe('hello')
      expect(centerText('longer text', 5)).toBe('longer text')
    })

    it('should center text with odd padding', () => {
      // Tests padding calculation
      expect(centerText('hi', 5)).toBe(' hi  ')
      expect(centerText('a', 7)).toBe('   a   ')
    })

    it('should center text with even padding', () => {
      expect(centerText('test', 8)).toBe('  test  ')
    })
  })

  describe('indentString edge cases', () => {
    it('should handle empty lines correctly', () => {
      // Tests line 186-187: regex with empty line handling
      const result = indentString('line1\n\nline3', { count: 2 })
      expect(result).toBe('  line1\n\n  line3')
    })

    it('should use default count of 1', () => {
      const result = indentString('hello')
      expect(result).toBe(' hello')
    })

    it('should handle large count values', () => {
      const result = indentString('test', { count: 10 })
      expect(result).toBe(`${' '.repeat(10)}test`)
    })
  })

  describe('isBlankString edge cases', () => {
    it('should handle various whitespace types', () => {
      // Tests line 223: /^\s+$/.test(value)
      expect(isBlankString(' \t\n\r ')).toBe(true)
      expect(isBlankString('\n\n\n')).toBe(true)
      expect(isBlankString('\t\t\t')).toBe(true)
    })

    it('should return false for non-blank strings', () => {
      expect(isBlankString(' a ')).toBe(false)
      expect(isBlankString('  \n  x  ')).toBe(false)
    })

    it('should handle non-string types', () => {
      expect(isBlankString(undefined)).toBe(false)
      expect(isBlankString(undefined)).toBe(false)
      expect(isBlankString(123)).toBe(false)
      expect(isBlankString({})).toBe(false)
    })
  })

  describe('fromCharCode', () => {
    it('should convert char codes to string', () => {
      expect(fromCharCode(65)).toBe('A')
      expect(fromCharCode(97)).toBe('a')
      expect(fromCharCode(48)).toBe('0')
    })

    it('should handle multiple char codes', () => {
      expect(fromCharCode(72, 105)).toBe('Hi')
      expect(fromCharCode(65, 66, 67)).toBe('ABC')
    })

    it('should handle unicode char codes', () => {
      // fromCharCode works with BMP characters (U+0000 to U+FFFF)
      expect(fromCharCode(0x4e_2d)).toBe('中')
      expect(fromCharCode(0x00_e9)).toBe('é')
    })

    it('should handle special characters', () => {
      expect(fromCharCode(10)).toBe('\n')
      expect(fromCharCode(13)).toBe('\r')
      expect(fromCharCode(9)).toBe('\t')
    })
  })

  describe('search additional cases', () => {
    it('should find pattern with fromIndex', () => {
      const result = search('hello world hello', /hello/, { fromIndex: 6 })
      expect(result).toBe(12)
    })

    it('should return -1 when not found after fromIndex', () => {
      const result = search('hello world', /hello/, { fromIndex: 6 })
      expect(result).toBe(-1)
    })

    it('should handle fromIndex of 0', () => {
      const result = search('test string', /test/, { fromIndex: 0 })
      expect(result).toBe(0)
    })

    it('should handle negative fromIndex by converting to positive', () => {
      // Negative fromIndex: -2 in 'test string' (length 11) = index 9
      // Pattern at beginning should be found when negative index allows it
      const result = search('test string', /test/, { fromIndex: -100 })
      expect(result).toBe(0) // Large negative wraps to 0, finds 'test' at start
    })

    it('should work without options object', () => {
      const result = search('test string', /string/)
      expect(result).toBe(5)
    })
  })

  describe('repeatString edge cases', () => {
    it('should repeat string multiple times', () => {
      expect(repeatString('ab', 3)).toBe('ababab')
      expect(repeatString('x', 5)).toBe('xxxxx')
    })

    it('should handle count of 0', () => {
      expect(repeatString('test', 0)).toBe('')
    })

    it('should handle count of 1', () => {
      expect(repeatString('test', 1)).toBe('test')
    })

    it('should handle empty string', () => {
      expect(repeatString('', 5)).toBe('')
    })

    it('should handle large counts', () => {
      const result = repeatString('a', 100)
      expect(result.length).toBe(100)
      expect(result).toBe('a'.repeat(100))
    })
  })
})
