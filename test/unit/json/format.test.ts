/**
 * @fileoverview Unit tests for JSON formatting utilities.
 *
 * Tests shared utilities for JSON formatting preservation including:
 * - Indentation detection (spaces, tabs, counts)
 * - Newline detection (LF, CRLF)
 * - Formatting extraction and application
 * - Key sorting
 * - Save determination logic with ignoreWhitespace and sort options
 * - Symbol-based metadata handling
 */

import {
  INDENT_SYMBOL,
  NEWLINE_SYMBOL,
  detectIndent,
  detectNewline,
  extractFormatting,
  getDefaultFormatting,
  getFormattingFromContent,
  shouldSave,
  sortKeys,
  stringifyWithFormatting,
  stripFormattingSymbols,
} from '@socketsecurity/lib/json/format'
import { describe, expect, it } from 'vitest'

// Helper type for objects with formatting symbols
type ContentWithSymbols = Record<string | symbol, unknown>

describe('json-format', () => {
  describe('INDENT_SYMBOL and NEWLINE_SYMBOL', () => {
    it('should be Symbol.for values', () => {
      expect(INDENT_SYMBOL.toString()).toBe('Symbol(indent)')
      expect(NEWLINE_SYMBOL.toString()).toBe('Symbol(newline)')
    })

    it('should be the same across imports', () => {
      expect(INDENT_SYMBOL).toBe(Symbol.for('indent'))
      expect(NEWLINE_SYMBOL).toBe(Symbol.for('newline'))
    })
  })

  describe('detectIndent', () => {
    it('should detect 2-space indentation', () => {
      const json = '{\n  "key": "value"\n}'
      expect(detectIndent(json)).toBe(2)
    })

    it('should detect 4-space indentation', () => {
      const json = '{\n    "key": "value"\n}'
      expect(detectIndent(json)).toBe(4)
    })

    it('should detect 8-space indentation', () => {
      const json = '{\n        "key": "value"\n}'
      expect(detectIndent(json)).toBe(8)
    })

    it('should detect tab indentation', () => {
      const json = '{\n\t"key": "value"\n}'
      expect(detectIndent(json)).toBe('\t')
    })

    it('should detect mixed indentation', () => {
      const json = '{\n \t "key": "value"\n}'
      expect(detectIndent(json)).toBe(' \t ')
    })

    it('should return 2 for compact JSON with no indentation', () => {
      const json = '{"key":"value"}'
      expect(detectIndent(json)).toBe(2)
    })

    it('should return 2 for empty object', () => {
      const json = '{}'
      expect(detectIndent(json)).toBe(2)
    })

    it('should detect indentation in arrays', () => {
      const json = '[\n  1,\n  2\n]'
      expect(detectIndent(json)).toBe(2)
    })

    it('should detect single space indentation', () => {
      const json = '{\n "key": "value"\n}'
      expect(detectIndent(json)).toBe(1)
    })

    it('should handle JSON with only newlines', () => {
      const json = '{\n\n}'
      // Detects the empty line as indent (empty string)
      expect(detectIndent(json)).toBe('\n')
    })
  })

  describe('detectNewline', () => {
    it('should detect LF newlines', () => {
      const json = '{\n  "key": "value"\n}'
      expect(detectNewline(json)).toBe('\n')
    })

    it('should detect CRLF newlines', () => {
      const json = '{\r\n  "key": "value"\r\n}'
      expect(detectNewline(json)).toBe('\r\n')
    })

    it('should return LF for JSON without newlines', () => {
      const json = '{"key":"value"}'
      expect(detectNewline(json)).toBe('\n')
    })

    it('should detect first newline type', () => {
      const json = '{\n  "key1": "value1",\r\n  "key2": "value2"\n}'
      expect(detectNewline(json)).toBe('\n')
    })

    it('should handle empty string', () => {
      const json = ''
      expect(detectNewline(json)).toBe('\n')
    })
  })

  describe('extractFormatting', () => {
    it('should extract both indent and newline', () => {
      const json = '{\n  "key": "value"\n}'
      const formatting = extractFormatting(json)
      expect(formatting).toEqual({
        indent: 2,
        newline: '\n',
      })
    })

    it('should extract 4-space indent with CRLF', () => {
      const json = '{\r\n    "key": "value"\r\n}'
      const formatting = extractFormatting(json)
      expect(formatting).toEqual({
        indent: 4,
        newline: '\r\n',
      })
    })

    it('should extract tab indent with LF', () => {
      const json = '{\n\t"key": "value"\n}'
      const formatting = extractFormatting(json)
      expect(formatting).toEqual({
        indent: '\t',
        newline: '\n',
      })
    })

    it('should extract defaults for compact JSON', () => {
      const json = '{"key":"value"}'
      const formatting = extractFormatting(json)
      expect(formatting).toEqual({
        indent: 2,
        newline: '\n',
      })
    })
  })

  describe('getDefaultFormatting', () => {
    it('should return 2-space indent and LF', () => {
      const formatting = getDefaultFormatting()
      expect(formatting).toEqual({
        indent: 2,
        newline: '\n',
      })
    })

    it('should return new object each time', () => {
      const formatting1 = getDefaultFormatting()
      const formatting2 = getDefaultFormatting()
      expect(formatting1).not.toBe(formatting2)
      expect(formatting1).toEqual(formatting2)
    })
  })

  describe('sortKeys', () => {
    it('should sort keys alphabetically', () => {
      const obj = { z: 3, a: 1, m: 2 }
      const sorted = sortKeys(obj)
      expect(Object.keys(sorted)).toEqual(['a', 'm', 'z'])
      expect(sorted).toEqual({ a: 1, m: 2, z: 3 })
    })

    it('should create null-prototype object', () => {
      const obj = { key: 'value' }
      const sorted = sortKeys(obj)
      expect(Object.getPrototypeOf(sorted)).toBe(null)
    })

    it('should handle empty object', () => {
      const obj = {}
      const sorted = sortKeys(obj)
      expect(sorted).toEqual({})
      expect(Object.keys(sorted)).toEqual([])
    })

    it('should handle single key', () => {
      const obj = { key: 'value' }
      const sorted = sortKeys(obj)
      expect(sorted).toEqual({ key: 'value' })
    })

    it('should preserve values', () => {
      const obj = {
        z: { nested: true },
        a: [1, 2, 3],
        m: 'string',
      }
      const sorted = sortKeys(obj)
      expect(sorted.z).toEqual({ nested: true })
      expect(sorted.a).toEqual([1, 2, 3])
      expect(sorted.m).toBe('string')
    })

    it('should not mutate original object', () => {
      const obj = { z: 3, a: 1 }
      const sorted = sortKeys(obj)
      expect(Object.keys(obj)).toEqual(['z', 'a'])
      expect(Object.keys(sorted)).toEqual(['a', 'z'])
    })

    it('should handle numeric-like keys', () => {
      const obj = { '2': 'two', '10': 'ten', '1': 'one' }
      const sorted = sortKeys(obj)
      // Alphabetical, not numeric sort (JavaScript sorts '10' between '1' and '2')
      expect(Object.keys(sorted)).toEqual(['1', '2', '10'])
    })
  })

  describe('stringifyWithFormatting', () => {
    it('should stringify with 2-space indent and LF', () => {
      const content = { key: 'value' }
      const formatting = { indent: 2, newline: '\n' }
      const result = stringifyWithFormatting(content, formatting)
      expect(result).toBe('{\n  "key": "value"\n}\n')
    })

    it('should stringify with 4-space indent and CRLF', () => {
      const content = { key: 'value' }
      const formatting = { indent: 4, newline: '\r\n' }
      const result = stringifyWithFormatting(content, formatting)
      expect(result).toBe('{\r\n    "key": "value"\r\n}\r\n')
    })

    it('should stringify with tab indent', () => {
      const content = { key: 'value' }
      const formatting = { indent: '\t', newline: '\n' }
      const result = stringifyWithFormatting(content, formatting)
      expect(result).toBe('{\n\t"key": "value"\n}\n')
    })

    it('should handle nested objects', () => {
      const content = { outer: { inner: 'value' } }
      const formatting = { indent: 2, newline: '\n' }
      const result = stringifyWithFormatting(content, formatting)
      expect(result).toContain('"outer"')
      expect(result).toContain('"inner"')
    })

    it('should handle arrays', () => {
      const content = { items: [1, 2, 3] }
      const formatting = { indent: 2, newline: '\n' }
      const result = stringifyWithFormatting(content, formatting)
      expect(result).toContain('"items"')
      expect(result).toContain('[')
    })

    it('should use default indent when undefined', () => {
      const content = { key: 'value' }
      const formatting = {
        indent: undefined as unknown as number,
        newline: '\n',
      }
      const result = stringifyWithFormatting(content, formatting)
      expect(result).toBe('{\n  "key": "value"\n}\n')
    })

    it('should use default indent when null', () => {
      const content = { key: 'value' }
      const formatting = { indent: null as unknown as number, newline: '\n' }
      const result = stringifyWithFormatting(content, formatting)
      expect(result).toBe('{\n  "key": "value"\n}\n')
    })

    it('should use default newline when undefined', () => {
      const content = { key: 'value' }
      const formatting = { indent: 2, newline: undefined as unknown as string }
      const result = stringifyWithFormatting(content, formatting)
      expect(result).toBe('{\n  "key": "value"\n}\n')
    })

    it('should use default newline when null', () => {
      const content = { key: 'value' }
      const formatting = { indent: 2, newline: null as unknown as string }
      const result = stringifyWithFormatting(content, formatting)
      expect(result).toBe('{\n  "key": "value"\n}\n')
    })
  })

  describe('stripFormattingSymbols', () => {
    it('should remove indent and newline symbols', () => {
      const content = {
        key: 'value',
        [INDENT_SYMBOL]: 2,
        [NEWLINE_SYMBOL]: '\n',
      } as Record<string | symbol, unknown>
      const stripped = stripFormattingSymbols(content)
      expect(stripped).toEqual({ key: 'value' })
      expect(Object.getOwnPropertySymbols(stripped).length).toBe(0)
    })

    it('should preserve all other keys', () => {
      const content = {
        a: 1,
        b: 'string',
        c: { nested: true },
        [INDENT_SYMBOL]: 4,
        [NEWLINE_SYMBOL]: '\r\n',
      }
      const stripped = stripFormattingSymbols(content)
      expect(stripped).toEqual({
        a: 1,
        b: 'string',
        c: { nested: true },
      })
    })

    it('should handle object without symbols', () => {
      const content = { key: 'value' }
      const stripped = stripFormattingSymbols(content)
      expect(stripped).toEqual({ key: 'value' })
    })

    it('should handle empty object', () => {
      const content = {}
      const stripped = stripFormattingSymbols(content)
      expect(stripped).toEqual({})
    })
  })

  describe('getFormattingFromContent', () => {
    it('should extract indent and newline from symbols', () => {
      const content = {
        key: 'value',
        [INDENT_SYMBOL]: 4,
        [NEWLINE_SYMBOL]: '\r\n',
      } as ContentWithSymbols
      const formatting = getFormattingFromContent(content)
      expect(formatting).toEqual({
        indent: 4,
        newline: '\r\n',
      })
    })

    it('should return defaults when symbols missing', () => {
      const content = { key: 'value' }
      const formatting = getFormattingFromContent(content)
      expect(formatting).toEqual({
        indent: 2,
        newline: '\n',
      })
    })

    it('should return defaults when indent is undefined', () => {
      const content = {
        [INDENT_SYMBOL]: undefined,
        [NEWLINE_SYMBOL]: '\n',
      } as ContentWithSymbols
      const formatting = getFormattingFromContent(content)
      expect(formatting.indent).toBe(2)
    })

    it('should return defaults when indent is null', () => {
      const content = {
        [INDENT_SYMBOL]: null,
        [NEWLINE_SYMBOL]: '\n',
      } as ContentWithSymbols
      const formatting = getFormattingFromContent(content)
      expect(formatting.indent).toBe(2)
    })

    it('should return defaults when newline is undefined', () => {
      const content = {
        [INDENT_SYMBOL]: 2,
        [NEWLINE_SYMBOL]: undefined,
      } as ContentWithSymbols
      const formatting = getFormattingFromContent(content)
      expect(formatting.newline).toBe('\n')
    })

    it('should return defaults when newline is null', () => {
      const content = {
        [INDENT_SYMBOL]: 2,
        [NEWLINE_SYMBOL]: null,
      } as ContentWithSymbols
      const formatting = getFormattingFromContent(content)
      expect(formatting.newline).toBe('\n')
    })

    it('should handle tab indentation', () => {
      const content = {
        [INDENT_SYMBOL]: '\t',
        [NEWLINE_SYMBOL]: '\n',
      } as ContentWithSymbols
      const formatting = getFormattingFromContent(content)
      expect(formatting.indent).toBe('\t')
    })
  })

  describe('shouldSave', () => {
    describe('basic change detection', () => {
      it('should return true when content changes', () => {
        const current = {
          key: 'new',
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const original = {
          key: 'old',
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const originalFile = '{\n  "key": "old"\n}\n'
        expect(shouldSave(current, original, originalFile)).toBe(true)
      })

      it('should return false when content unchanged', () => {
        const current = {
          key: 'value',
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const original = {
          key: 'value',
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const originalFile = '{\n  "key": "value"\n}\n'
        expect(shouldSave(current, original, originalFile)).toBe(false)
      })

      it('should return true when key added', () => {
        const current = {
          key1: 'value1',
          key2: 'value2',
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const original = {
          key1: 'value1',
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const originalFile = '{\n  "key1": "value1"\n}\n'
        expect(shouldSave(current, original, originalFile)).toBe(true)
      })

      it('should return true when key removed', () => {
        const current = {
          key1: 'value1',
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const original = {
          key1: 'value1',
          key2: 'value2',
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const originalFile = '{\n  "key1": "value1",\n  "key2": "value2"\n}\n'
        expect(shouldSave(current, original, originalFile)).toBe(true)
      })
    })

    describe('ignoreWhitespace option', () => {
      it('should return false when only whitespace differs', () => {
        const current = {
          key: 'value',
          [INDENT_SYMBOL]: 4,
          [NEWLINE_SYMBOL]: '\r\n',
        } as ContentWithSymbols
        const original = {
          key: 'value',
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const originalFile = '{\n  "key": "value"\n}\n'
        expect(
          shouldSave(current, original, originalFile, {
            ignoreWhitespace: true,
          }),
        ).toBe(false)
      })

      it('should return true when content differs with ignoreWhitespace', () => {
        const current = {
          key: 'new',
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const original = {
          key: 'old',
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const originalFile = '{\n  "key": "old"\n}\n'
        expect(
          shouldSave(current, original, originalFile, {
            ignoreWhitespace: true,
          }),
        ).toBe(true)
      })
    })

    describe('sort option', () => {
      it('should return true when sort changes key order', () => {
        const current = {
          z: 3,
          a: 1,
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const original = {
          z: 3,
          a: 1,
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const originalFile = '{\n  "z": 3,\n  "a": 1\n}\n'
        expect(
          shouldSave(current, original, originalFile, { sort: true }),
        ).toBe(true)
      })

      it('should return false when already sorted', () => {
        const current = {
          a: 1,
          z: 3,
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const original = {
          a: 1,
          z: 3,
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const originalFile = '{\n  "a": 1,\n  "z": 3\n}\n'
        expect(
          shouldSave(current, original, originalFile, { sort: true }),
        ).toBe(false)
      })
    })

    describe('sortFn option', () => {
      it('should use custom sort function', () => {
        const customSort = (obj: Record<string, unknown>) => {
          // Reverse alphabetical sort
          const sorted: Record<string, unknown> = { __proto__: null }
          const keys = Object.keys(obj).sort().reverse()
          for (const key of keys) {
            sorted[key] = obj[key]
          }
          return sorted
        }

        const current = {
          a: 1,
          z: 3,
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const original = {
          a: 1,
          z: 3,
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const originalFile = '{\n  "a": 1,\n  "z": 3\n}\n'

        // Custom sort (reverse) should differ from original order
        expect(
          shouldSave(current, original, originalFile, { sortFn: customSort }),
        ).toBe(true)
      })

      it('should prioritize sortFn over sort option', () => {
        const customSort = (obj: Record<string, unknown>) => obj // No-op sort

        const current = {
          z: 3,
          a: 1,
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const original = {
          z: 3,
          a: 1,
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const originalFile = '{\n  "z": 3,\n  "a": 1\n}\n'

        // sortFn is no-op, so order stays the same
        expect(
          shouldSave(current, original, originalFile, {
            sort: true,
            sortFn: customSort,
          }),
        ).toBe(false)
      })
    })

    describe('undefined original content', () => {
      it('should return true when original is undefined', () => {
        const current = {
          key: 'value',
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const originalFile = ''
        expect(shouldSave(current, undefined, originalFile)).toBe(true)
      })

      it('should handle empty content with undefined original', () => {
        const current = {
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const originalFile = ''
        expect(shouldSave(current, undefined, originalFile)).toBe(true)
      })
    })

    describe('edge cases', () => {
      it('should handle empty objects', () => {
        const current = {
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const original = {
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const originalFile = '{}\n'
        expect(shouldSave(current, original, originalFile)).toBe(false)
      })

      it('should handle content with extra whitespace', () => {
        const current = {
          key: 'value',
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const original = {
          key: 'value',
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const originalFile = '{\n  "key": "value"\n}\n\n\n'
        // Trimmed comparison should handle extra whitespace
        expect(shouldSave(current, original, originalFile)).toBe(false)
      })

      it('should handle nested objects', () => {
        const current = {
          outer: { inner: 'new' },
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        }
        const original = {
          outer: { inner: 'old' },
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        }
        const originalFile = '{\n  "outer": {\n    "inner": "old"\n  }\n}\n'
        expect(shouldSave(current, original, originalFile)).toBe(true)
      })

      it('should handle arrays', () => {
        const current = {
          items: [1, 2, 3],
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const original = {
          items: [1, 2],
          [INDENT_SYMBOL]: 2,
          [NEWLINE_SYMBOL]: '\n',
        } as ContentWithSymbols
        const originalFile = '{\n  "items": [1, 2]\n}\n'
        expect(shouldSave(current, original, originalFile)).toBe(true)
      })
    })
  })
})
