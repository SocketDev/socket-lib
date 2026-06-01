/**
 * @file Unit tests for string utility edge cases (part 2). Split from
 *   strings.test.mts to stay under the file-line cap. Covers additional
 *   coverage for toKebabCase(), fromCharCode(), stringWidth(), stripBom(),
 *   search(), indentString(), isNonEmptyString(), trimNewlines(), centerText(),
 *   repeatString(), applyLinePrefix(), and isBlankString().
 */

import { stripAnsi } from '../../src/ansi/strip'
import {
  applyLinePrefix,
  centerText,
  fromCharCode,
  indentString,
  repeatString,
} from '../../src/strings/format'
import { isBlankString, isNonEmptyString } from '../../src/strings/predicates'
import { search } from '../../src/strings/search'
import { stripBom, toKebabCase, trimNewlines } from '../../src/strings/transform'
import { stringWidth } from '../../src/strings/width'
import { describe, expect, it } from 'vitest'

describe('strings edge cases (part 2)', () => {
  describe('toKebabCase with snake_case', () => {
    it('should convert snake_case to kebab-case', () => {
      expect(toKebabCase('snake_case_string')).toBe('snake-case-string')
      expect(toKebabCase('multiple_underscore_words')).toBe(
        'multiple-underscore-words',
      )
    })

    it('should handle mixed camelCase and snake_case', () => {
      expect(toKebabCase('camelCase_with_underscores')).toBe(
        'camel-case-with-underscores',
      )
    })

    it('should handle empty strings', () => {
      expect(toKebabCase('')).toBe('')
    })
  })

  describe('fromCharCode', () => {
    it('should convert char codes to string', () => {
      expect(fromCharCode(65)).toBe('A')
      expect(fromCharCode(97)).toBe('a')
      expect(fromCharCode(48)).toBe('0')
    })

    it('should handle multiple char codes', () => {
      expect(fromCharCode(72, 101, 108, 108, 111)).toBe('Hello')
    })

    it('should handle Unicode characters in BMP', () => {
      // fromCharCode handles BMP (Basic Multilingual Plane) characters (0x0000-0xFFFF)
      expect(fromCharCode(0x27_64)).toBe('❤')
      expect(fromCharCode(0x26_3a)).toBe('☺')
    })
  })

  describe('stringWidth edge case coverage', () => {
    it('should handle non-string input', () => {
      expect(stringWidth(undefined as unknown as string)).toBe(0)
      expect(stringWidth(undefined as unknown as string)).toBe(0)
      // @ts-expect-error - Testing runtime behavior with invalid argument type.
      expect(stringWidth(123)).toBe(0)
    })

    it('should handle strings with only ANSI codes', () => {
      expect(stringWidth('\x1b[31m\x1b[0m')).toBe(0)
    })

    it('should handle trailing halfwidth forms in multi-char segments', () => {
      // Test segment length > 1 with halfwidth/fullwidth forms
      const textWithTrailingHalfwidth = 'test\uff9e' // with halfwidth dakuten
      expect(stringWidth(textWithTrailingHalfwidth)).toBeGreaterThanOrEqual(4)
    })

    it('should handle fullwidth forms', () => {
      // Test characters in 0xFF00-0xFFEF range
      expect(stringWidth('\uff21')).toBe(2) // Fullwidth A
      expect(stringWidth('\uff41')).toBe(2) // Fullwidth a
    })
  })

  describe('stripBom comprehensive coverage', () => {
    it('should strip BOM from start of string', () => {
      expect(stripBom('\ufeffhello')).toBe('hello')
    })

    it('should not strip BOM from middle of string', () => {
      expect(stripBom('hello\ufeffworld')).toBe('hello\ufeffworld')
    })

    it('should handle empty string', () => {
      expect(stripBom('')).toBe('')
    })

    it('should handle string without BOM', () => {
      expect(stripBom('hello')).toBe('hello')
    })

    it('should handle string with only BOM', () => {
      expect(stripBom('\ufeff')).toBe('')
    })
  })

  describe('search edge cases', () => {
    it('should handle fromIndex >= length', () => {
      expect(search('test', /t/, { fromIndex: 10 })).toBe(-1)
      expect(search('test', /t/, { fromIndex: 4 })).toBe(-1)
    })

    it('should handle negative fromIndex', () => {
      expect(search('hello world', /world/, { fromIndex: -5 })).toBe(6)
      expect(search('test', /t/, { fromIndex: -2 })).toBe(3)
    })

    it('should handle very large negative fromIndex', () => {
      expect(search('test', /t/, { fromIndex: -100 })).toBe(0)
    })
  })

  describe('indentString with options', () => {
    it('should use default count of 1', () => {
      expect(indentString('test')).toBe(' test')
    })

    it('should handle custom count', () => {
      expect(indentString('test', { count: 4 })).toBe('    test')
    })

    it('should not indent empty lines', () => {
      expect(indentString('line1\n\nline3', { count: 2 })).toBe(
        '  line1\n\n  line3',
      )
    })

    it('should not indent whitespace-only lines', () => {
      expect(indentString('line1\n   \nline3', { count: 2 })).toBe(
        '  line1\n   \n  line3',
      )
    })
  })

  describe('isNonEmptyString comprehensive', () => {
    it('should return true for non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true)
      expect(isNonEmptyString(' ')).toBe(true)
      expect(isNonEmptyString('0')).toBe(true)
    })

    it('should return false for empty string', () => {
      expect(isNonEmptyString('')).toBe(false)
    })

    it('should return false for non-strings', () => {
      expect(isNonEmptyString(undefined)).toBe(false)
      expect(isNonEmptyString(undefined)).toBe(false)
      expect(isNonEmptyString(123)).toBe(false)
      expect(isNonEmptyString([])).toBe(false)
      expect(isNonEmptyString({})).toBe(false)
    })
  })

  describe('trimNewlines comprehensive', () => {
    it('should handle single character strings', () => {
      expect(trimNewlines('a')).toBe('a')
      expect(trimNewlines('\n')).toBe('')
      expect(trimNewlines('\r')).toBe('')
    })

    it('should handle strings with no newlines', () => {
      expect(trimNewlines('hello world')).toBe('hello world')
    })

    it('should handle mixed newline types', () => {
      expect(trimNewlines('\r\n\nhello\n\r')).toBe('hello')
    })

    it('should preserve middle newlines', () => {
      expect(trimNewlines('\nhello\nworld\n')).toBe('hello\nworld')
    })
  })

  describe('centerText edge cases', () => {
    it('should return original text when width <= text length', () => {
      expect(centerText('hello', 5)).toBe('hello')
      expect(centerText('hello', 3)).toBe('hello')
    })

    it('should handle text with ANSI codes', () => {
      const colored = '\x1b[31mred\x1b[0m'
      const result = centerText(colored, 10)
      expect(result.includes('red')).toBe(true)
      expect(stripAnsi(result).trim()).toBe('red')
    })

    it('should handle empty text', () => {
      expect(centerText('', 10).length).toBe(10)
    })
  })

  describe('repeatString edge cases', () => {
    it('should handle negative count', () => {
      expect(repeatString('test', -1)).toBe('')
    })

    it('should handle non-integer count', () => {
      expect(repeatString('ab', 2.9)).toBe('abab')
    })

    it('should handle very long strings', () => {
      const result = repeatString('x', 1000)
      expect(result.length).toBe(1000)
    })
  })

  describe('applyLinePrefix with newlines', () => {
    it('should handle trailing newline', () => {
      expect(applyLinePrefix('line\n', { prefix: '> ' })).toBe('> line\n> ')
    })

    it('should handle multiple consecutive newlines', () => {
      expect(applyLinePrefix('a\n\n\nb', { prefix: '> ' })).toBe(
        '> a\n> \n> \n> b',
      )
    })

    it('should handle Windows-style line endings', () => {
      expect(applyLinePrefix('line1\r\nline2', { prefix: '> ' })).toBe(
        '> line1\r\n> line2',
      )
    })

    it('should return string unchanged when prefix is undefined', () => {
      expect(applyLinePrefix('test', undefined)).toBe('test')
    })
  })

  describe('stringWidth codePoint undefined coverage', () => {
    it('should handle segments with only non-printing after strip', () => {
      // Test codePoint === undefined branch
      const textWithControlOnly = '\x00\x01\x02'
      expect(stringWidth(textWithControlOnly)).toBe(0)
    })

    it('should handle complex segments with trailing undefined', () => {
      // Force trailingCodePoint !== undefined check
      const textWithHalfwidth = 'a\uff9e\uff9f' // halfwidth marks
      expect(stringWidth(textWithHalfwidth)).toBeGreaterThanOrEqual(1)
    })

    it('should handle combining marks as zero-width', () => {
      // Test zero-width cluster regex
      expect(stringWidth('e\u0301')).toBe(1) // e + combining acute
      expect(stringWidth('\u0301')).toBe(0) // just combining mark
    })
  })

  describe('trimNewlines comprehensive edge cases', () => {
    it('should handle length === 0 early return', () => {
      expect(trimNewlines('')).toBe('')
    })

    it('should handle length === 1 with newline', () => {
      expect(trimNewlines('\n')).toBe('')
      expect(trimNewlines('\r')).toBe('')
    })

    it('should handle length === 1 without newline', () => {
      expect(trimNewlines('a')).toBe('a')
      expect(trimNewlines(' ')).toBe(' ')
    })

    it('should trigger noFirstNewline && noLastNewline early return', () => {
      expect(trimNewlines('ab')).toBe('ab')
      expect(trimNewlines('test')).toBe('test')
    })

    it('should handle only leading newlines', () => {
      expect(trimNewlines('\n\ntest')).toBe('test')
      expect(trimNewlines('\r\rtest')).toBe('test')
    })

    it('should handle only trailing newlines', () => {
      expect(trimNewlines('test\n\n')).toBe('test')
      expect(trimNewlines('test\r\r')).toBe('test')
    })
  })

  describe('centerText calculation branches', () => {
    it('should calculate padding correctly for odd difference', () => {
      expect(centerText('a', 4)).toBe(' a  ') // leftPad=1, rightPad=2
    })

    it('should calculate padding correctly for even difference', () => {
      expect(centerText('ab', 6)).toBe('  ab  ') // leftPad=2, rightPad=2
    })

    it('should handle exact width match', () => {
      expect(centerText('hello', 5)).toBe('hello')
    })
  })

  describe('indentString regex branch coverage', () => {
    it('should match non-empty lines', () => {
      expect(indentString('a\nb\nc', { count: 2 })).toBe('  a\n  b\n  c')
    })

    it('should not match empty lines', () => {
      expect(indentString('\n\n', { count: 2 })).toBe('\n\n')
    })

    it('should not match whitespace-only lines', () => {
      expect(indentString('  \n  ', { count: 2 })).toBe('  \n  ')
    })
  })

  describe('search offset calculation', () => {
    it('should handle fromIndex === 0 fast path', () => {
      expect(search('hello', /l/, { fromIndex: 0 })).toBe(2)
    })

    it('should calculate offset for positive fromIndex', () => {
      expect(search('hello', /l/, { fromIndex: 3 })).toBe(3)
    })

    it('should calculate offset for negative fromIndex', () => {
      const result = search('hello world', /o/, { fromIndex: -6 })
      expect(result).toBeGreaterThanOrEqual(0)
    })

    it('should handle result === -1 in offset calculation', () => {
      expect(search('hello', /z/, { fromIndex: 2 })).toBe(-1)
    })
  })

  describe('isBlankString regex test', () => {
    it('should test empty length first', () => {
      expect(isBlankString('')).toBe(true)
    })

    it('should test whitespace regex for non-empty', () => {
      expect(isBlankString('   ')).toBe(true)
      expect(isBlankString('\t\n')).toBe(true)
    })

    it('should return false for non-whitespace', () => {
      expect(isBlankString('a')).toBe(false)
    })
  })
})
