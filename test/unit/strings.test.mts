/**
 * @file Unit tests for string manipulation utilities. Tests comprehensive
 *   string processing functions:
 *
 *   - ANSI handling: ansiRegex(), stripAnsi() for terminal color code processing
 *   - Line manipulation: applyLinePrefix(), indentString(), trimNewlines()
 *   - Case conversion: toKebabCase() with camelCase + snake_case support
 *   - Text formatting: centerText(), repeatString()
 *   - Width calculation: stringWidth() accounts for CJK characters, emoji,
 *     combining marks
 *   - Type guards: isBlankString(), isNonEmptyString()
 *   - Utilities: stripBom(), search() with fromIndex support Tests include
 *     extensive edge cases for Unicode (emoji, CJK, zero-width chars), ANSI
 *     escape codes, platform line endings, and terminal column width
 *     calculations. stringWidth() based on string-width by Sindre Sorhus
 *     (MIT).
 */

import { ansiRegex, stripAnsi } from '../../src/ansi/strip'
import {
  applyLinePrefix,
  centerText,
  fromCharCode,
  indentString,
  repeatString,
} from '../../src/strings/format'
import { isBlankString, isNonEmptyString } from '../../src/strings/predicates'
import { search } from '../../src/strings/search'
import {
  stripBom,
  toKebabCase,
  trimNewlines,
} from '../../src/strings/transform'
import { stringWidth } from '../../src/strings/width'
import { describe, expect, it } from 'vitest'

describe('strings', () => {
  describe('ansiRegex', () => {
    it('should match ANSI escape codes', () => {
      expect('\x1b[31mred\x1b[0m'.match(ansiRegex())).toBeTruthy()
      expect('\x1b[1mbold\x1b[0m'.match(ansiRegex())).toBeTruthy()
    })

    it('should not match plain text', () => {
      expect('plain text'.match(ansiRegex())).toBeNull()
    })
  })

  describe('stripAnsi', () => {
    it('should remove ANSI escape codes', () => {
      expect(stripAnsi('\x1b[31mred\x1b[0m')).toBe('red')
      expect(stripAnsi('\x1b[1mbold\x1b[22m text')).toBe('bold text')
    })

    it('should return plain text unchanged', () => {
      expect(stripAnsi('plain text')).toBe('plain text')
    })

    it('should handle empty strings', () => {
      expect(stripAnsi('')).toBe('')
    })
  })

  describe('applyLinePrefix', () => {
    it('should apply prefix to single line', () => {
      const result = applyLinePrefix('hello', { prefix: '> ' })
      expect(result).toBe('> hello')
    })

    it('should apply prefix to multiple lines', () => {
      const result = applyLinePrefix('line1\nline2\nline3', { prefix: '> ' })
      expect(result).toBe('> line1\n> line2\n> line3')
    })

    it('should handle empty prefix', () => {
      const result = applyLinePrefix('hello', { prefix: '' })
      expect(result).toBe('hello')
    })

    it('should handle no options', () => {
      const result = applyLinePrefix('hello')
      expect(result).toBe('hello')
    })

    it('should apply prefix even to empty string', () => {
      const result = applyLinePrefix('', { prefix: '> ' })
      expect(result).toBe('> ')
    })
  })

  describe('indentString', () => {
    it('should indent single line with default count', () => {
      expect(indentString('hello')).toBe(' hello')
    })

    it('should indent with custom count', () => {
      expect(indentString('hello', { count: 4 })).toBe('    hello')
    })

    it('should indent multiple lines', () => {
      const result = indentString('line1\nline2\nline3', { count: 2 })
      expect(result).toBe('  line1\n  line2\n  line3')
    })

    it('should not indent empty lines', () => {
      const result = indentString('line1\n\nline3', { count: 2 })
      expect(result).toBe('  line1\n\n  line3')
    })

    it('should handle empty string', () => {
      expect(indentString('')).toBe('')
    })
  })

  describe('isBlankString', () => {
    it('should return true for empty string', () => {
      expect(isBlankString('')).toBe(true)
    })

    it('should return true for whitespace-only strings', () => {
      expect(isBlankString(' ')).toBe(true)
      expect(isBlankString('  ')).toBe(true)
      expect(isBlankString('\t')).toBe(true)
      expect(isBlankString('\n')).toBe(true)
      expect(isBlankString(' \t\n ')).toBe(true)
    })

    it('should return false for non-empty strings', () => {
      expect(isBlankString('hello')).toBe(false)
      expect(isBlankString(' hello ')).toBe(false)
    })

    it('should return false for non-strings', () => {
      expect(isBlankString(undefined)).toBe(false)
      expect(isBlankString(undefined)).toBe(false)
      expect(isBlankString(123)).toBe(false)
      expect(isBlankString({})).toBe(false)
    })
  })

  describe('isNonEmptyString', () => {
    it('should return true for non-empty strings', () => {
      expect(isNonEmptyString('hello')).toBe(true)
      expect(isNonEmptyString(' ')).toBe(true)
      expect(isNonEmptyString('a')).toBe(true)
    })

    it('should return false for empty string', () => {
      expect(isNonEmptyString('')).toBe(false)
    })

    it('should return false for non-strings', () => {
      expect(isNonEmptyString(undefined)).toBe(false)
      expect(isNonEmptyString(undefined)).toBe(false)
      expect(isNonEmptyString(123)).toBe(false)
      expect(isNonEmptyString([])).toBe(false)
    })
  })

  describe('search', () => {
    it('should find pattern from beginning', () => {
      expect(search('hello world', /world/)).toBe(6)
    })

    it('should find pattern from custom index', () => {
      expect(search('hello hello', /hello/, { fromIndex: 1 })).toBe(6)
    })

    it('should return -1 when pattern not found', () => {
      expect(search('hello', /goodbye/)).toBe(-1)
    })

    it('should handle negative fromIndex', () => {
      expect(search('hello world', /world/, { fromIndex: -5 })).toBe(6)
    })

    it('should return -1 when fromIndex >= length', () => {
      expect(search('hello', /hello/, { fromIndex: 10 })).toBe(-1)
    })

    it('should handle empty string', () => {
      expect(search('', /test/)).toBe(-1)
    })
  })

  describe('stripBom', () => {
    it('should strip BOM from beginning', () => {
      expect(stripBom('\uFEFFhello')).toBe('hello')
    })

    it('should not strip BOM from middle', () => {
      expect(stripBom('hello\uFEFFworld')).toBe('hello\uFEFFworld')
    })

    it('should handle strings without BOM', () => {
      expect(stripBom('hello')).toBe('hello')
    })

    it('should handle empty string', () => {
      expect(stripBom('')).toBe('')
    })
  })

  describe('stringWidth', () => {
    it('should calculate width of ASCII characters', () => {
      expect(stringWidth('hello')).toBe(5)
      expect(stringWidth('test')).toBe(4)
    })

    it('should handle empty string', () => {
      expect(stringWidth('')).toBe(0)
    })

    it('should strip ANSI codes before measuring', () => {
      expect(stringWidth('\x1b[31mred\x1b[0m')).toBe(3)
      expect(stringWidth('\x1b[1;31mbold red\x1b[0m')).toBe(8)
    })

    it('should handle strings with spaces', () => {
      expect(stringWidth('hello world')).toBe(11)
    })

    it('should handle wide characters correctly', () => {
      // CJK characters are typically wide (2 columns)
      expect(stringWidth('你好')).toBeGreaterThanOrEqual(4)
      expect(stringWidth('漢字')).toBeGreaterThanOrEqual(4)
    })

    it('should handle control characters', () => {
      expect(stringWidth('hello\nworld')).toBe(10)
      expect(stringWidth('tab\there')).toBe(7)
    })

    it('should handle emoji correctly', () => {
      // Basic emoji should be 2 columns
      expect(stringWidth('👍')).toBe(2)
      expect(stringWidth('😀')).toBe(2)
      expect(stringWidth('⚡')).toBe(2)
    })

    it('should handle emoji with skin tone modifiers', () => {
      // Emoji with skin tone should still be 2 columns
      expect(stringWidth('👍🏽')).toBe(2)
    })

    it('should handle complex emoji sequences', () => {
      // ZWJ sequences should be 2 columns
      expect(stringWidth('👨‍👩‍👧‍👦')).toBe(2)
    })

    it('should handle combining marks', () => {
      // Base character + combining mark should be width of base
      expect(stringWidth('é')).toBe(1) // precomposed
      expect(stringWidth('e\u0301')).toBe(1) // e + combining acute
    })

    it('should handle zero-width characters', () => {
      expect(stringWidth('hello\u200Bworld')).toBe(10) // zero-width space
      expect(stringWidth('test\uFEFFing')).toBe(7) // zero-width no-break space
    })

    it('should handle fullwidth forms', () => {
      // Fullwidth ASCII should be 2 columns each
      expect(stringWidth('ＡＢＣ')).toBeGreaterThan(3)
    })

    it('should handle halfwidth Katakana', () => {
      // Halfwidth should be 1 column
      expect(stringWidth('ｱｲｳ')).toBe(3)
    })

    it('should return 0 for non-string input', () => {
      expect(stringWidth(undefined as unknown as string)).toBe(0)
      expect(stringWidth(undefined as unknown as string)).toBe(0)
      // @ts-expect-error - Testing runtime behavior with invalid argument type.
      expect(stringWidth(123)).toBe(0)
    })

    it('should handle mixed content', () => {
      const mixed = 'hello 你好 ⚡ world'
      expect(stringWidth(mixed)).toBeGreaterThan(15)
    })

    it('should handle strings with only ANSI codes', () => {
      expect(stringWidth('\x1b[31m\x1b[0m')).toBe(0)
    })

    it('should handle long strings', () => {
      const long = 'a'.repeat(1000)
      expect(stringWidth(long)).toBe(1000)
    })

    it('should handle Greek letters (ambiguous width)', () => {
      // Ambiguous characters treated as narrow (1 column)
      expect(stringWidth('αβγ')).toBe(3)
    })

    it('should handle Cyrillic letters', () => {
      expect(stringWidth('АБВ')).toBe(3)
    })

    it('should handle box drawing characters', () => {
      expect(stringWidth('─│┌')).toBe(3)
    })
  })

  describe('toKebabCase', () => {
    it('should convert camelCase to kebab-case', () => {
      expect(toKebabCase('camelCase')).toBe('camel-case')
      expect(toKebabCase('myVariableName')).toBe('my-variable-name')
    })

    it('should convert snake_case to kebab-case', () => {
      expect(toKebabCase('snake_case')).toBe('snake-case')
      expect(toKebabCase('my_variable_name')).toBe('my-variable-name')
    })

    it('should handle already kebab-case', () => {
      expect(toKebabCase('kebab-case')).toBe('kebab-case')
    })

    it('should handle mixed formats', () => {
      expect(toKebabCase('mixedCase_with_Snake')).toBe('mixed-case-with-snake')
    })

    it('should handle empty string', () => {
      expect(toKebabCase('')).toBe('')
    })

    it('should handle numbers', () => {
      expect(toKebabCase('version2')).toBe('version2')
    })
  })

  describe('trimNewlines', () => {
    it('should trim newlines from both ends', () => {
      expect(trimNewlines('\nhello\n')).toBe('hello')
      expect(trimNewlines('\n\nhello\n\n')).toBe('hello')
    })

    it('should handle carriage returns', () => {
      expect(trimNewlines('\rhello\r')).toBe('hello')
      expect(trimNewlines('\r\nhello\r\n')).toBe('hello')
    })

    it('should not trim newlines from middle', () => {
      expect(trimNewlines('hello\nworld')).toBe('hello\nworld')
    })

    it('should handle strings without newlines', () => {
      expect(trimNewlines('hello')).toBe('hello')
    })

    it('should handle empty string', () => {
      expect(trimNewlines('')).toBe('')
    })

    it('should handle string with only newlines', () => {
      expect(trimNewlines('\n\n')).toBe('')
      expect(trimNewlines('\r\n\r\n')).toBe('')
    })
  })

  describe('repeatString', () => {
    it('should repeat string n times', () => {
      expect(repeatString('x', 3)).toBe('xxx')
      expect(repeatString('ab', 2)).toBe('abab')
    })

    it('should return empty string for count <= 0', () => {
      expect(repeatString('x', 0)).toBe('')
      expect(repeatString('x', -1)).toBe('')
    })

    it('should handle empty string', () => {
      expect(repeatString('', 5)).toBe('')
    })

    it('should handle single repetition', () => {
      expect(repeatString('hello', 1)).toBe('hello')
    })
  })

  describe('centerText', () => {
    it('should center text with even padding', () => {
      expect(centerText('hi', 6)).toBe('  hi  ')
    })

    it('should center text with odd padding', () => {
      expect(centerText('hi', 7)).toBe('  hi   ')
    })

    it('should not pad if text is longer than width', () => {
      expect(centerText('hello', 3)).toBe('hello')
    })

    it('should handle text equal to width', () => {
      expect(centerText('hello', 5)).toBe('hello')
    })

    it('should strip ANSI codes for width calculation', () => {
      const text = '\x1b[31mred\x1b[0m'
      const result = centerText(text, 7)
      // Should center based on visible width (3), not string length
      expect(result.length).toBeGreaterThan(text.length)
    })

    it('should handle empty string', () => {
      expect(centerText('', 5)).toBe('     ')
    })

    it('should handle width of 0', () => {
      expect(centerText('test', 0)).toBe('test')
    })

    it('should handle negative width', () => {
      expect(centerText('test', -5)).toBe('test')
    })
  })

  describe('fromCharCode', () => {
    it('should be exported', () => {
      expect(typeof fromCharCode).toBe('function')
    })

    it('should convert char codes to strings', () => {
      expect(fromCharCode(65)).toBe('A')
      expect(fromCharCode(97)).toBe('a')
      expect(fromCharCode(48)).toBe('0')
    })
  })
})
