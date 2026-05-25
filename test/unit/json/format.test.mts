/**
 * @file Unit tests for src/json/format — detectIndent, detectNewline, sortKeys,
 *   stringifyWithFormatting, stripFormattingSymbols. Split out of the
 *   historical monolithic test/unit/json.test.mts.
 */

import { describe, expect, it } from 'vitest'

import {
  detectIndent,
  detectNewline,
  sortKeys,
  stringifyWithFormatting,
  stripFormattingSymbols,
} from '../../../src/json/format'

describe('formatting', () => {
  describe('detectIndent', () => {
    it('should detect 2-space indentation', () => {
      const json = '{\n  "key": "value"\n}'
      expect(detectIndent(json)).toBe(2)
    })

    it('should detect 4-space indentation', () => {
      const json = '{\n    "key": "value"\n}'
      expect(detectIndent(json)).toBe(4)
    })

    it('should detect tab indentation', () => {
      const json = '{\n\t"key": "value"\n}'
      expect(detectIndent(json)).toBe('\t')
    })

    it('should default to 2 spaces for undetectable indentation', () => {
      const json = '{"key":"value"}'
      expect(detectIndent(json)).toBe(2)
    })
  })

  describe('detectNewline', () => {
    it('should detect LF line endings', () => {
      const json = '{\n  "key": "value"\n}'
      expect(detectNewline(json)).toBe('\n')
    })

    it('should detect CRLF line endings', () => {
      const json = '{\r\n  "key": "value"\r\n}'
      expect(detectNewline(json)).toBe('\r\n')
    })

    it('should default to LF for undetectable line endings', () => {
      const json = '{"key":"value"}'
      expect(detectNewline(json)).toBe('\n')
    })
  })

  describe('stringifyWithFormatting', () => {
    it('should preserve 4-space indentation', () => {
      const obj = { key: 'value', newKey: 'newValue' }
      const result = stringifyWithFormatting(obj, {
        indent: 4,
        newline: '\n',
      })
      expect(result).toContain('    ')
      expect(result).toContain('"key"')
      expect(result).toContain('"newKey"')
    })

    it('should preserve CRLF line endings', () => {
      const obj = { key: 'value' }
      const result = stringifyWithFormatting(obj, {
        indent: 2,
        newline: '\r\n',
      })
      expect(result).toContain('\r\n')
    })

    it('should preserve tab indentation', () => {
      const obj = { key: 'value' }
      const result = stringifyWithFormatting(obj, {
        indent: '\t',
        newline: '\n',
      })
      expect(result).toContain('\t')
    })
  })

  describe('sortKeys', () => {
    it('should sort object keys alphabetically', () => {
      const obj = { z: 3, a: 1, m: 2 }
      const sorted = sortKeys(obj)
      expect(Object.keys(sorted)).toEqual(['a', 'm', 'z'])
      expect(sorted).toEqual({ a: 1, m: 2, z: 3 })
    })

    it('should handle empty objects', () => {
      const sorted = sortKeys({})
      expect(Object.keys(sorted)).toEqual([])
    })

    it('should handle single key', () => {
      const sorted = sortKeys({ only: 'one' })
      expect(Object.keys(sorted)).toEqual(['only'])
    })

    it('should not mutate input', () => {
      const obj = { z: 3, a: 1 }
      const sorted = sortKeys(obj)
      expect(Object.keys(obj)).toEqual(['z', 'a'])
      expect(Object.keys(sorted)).toEqual(['a', 'z'])
    })
  })

  describe('stripFormattingSymbols', () => {
    it('should remove indent and newline symbols', () => {
      const indentSymbol = Symbol.for('indent')
      const newlineSymbol = Symbol.for('newline')
      const obj = {
        [indentSymbol]: 2,
        [newlineSymbol]: '\n',
        key: 'value',
      }
      const stripped = stripFormattingSymbols(obj)
      expect(stripped).toEqual({ key: 'value' })
      expect(indentSymbol in stripped).toBe(false)
      expect(newlineSymbol in stripped).toBe(false)
    })

    it('should handle objects without symbols', () => {
      const obj = { key: 'value' }
      const stripped = stripFormattingSymbols(obj)
      expect(stripped).toEqual({ key: 'value' })
    })
  })
})
