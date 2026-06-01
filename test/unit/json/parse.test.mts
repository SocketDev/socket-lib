/**
 * @file Unit tests for src/json/parse — parseJson happy-path behavior (valid
 *   parsing, Buffer input, BOM stripping, reviver, options handling). The
 *   isJsonPrimitive, prototypePollutionReviver, and parseJson error/edge-case
 *   suites live in sibling parse-*.test.mts files to keep each test file under
 *   the fleet's 500-line soft cap.
 */

import { describe, expect, it } from 'vitest'

import { parseJson } from '../../../src/json/parse'

describe('parseJson', () => {
  describe('valid JSON parsing', () => {
    it('should parse valid JSON string', () => {
      const result = parseJson('{"key":"value"}')
      expect(result).toEqual({ key: 'value' })
    })

    it('should parse JSON array', () => {
      const result = parseJson('[1,2,3]')
      expect(result).toEqual([1, 2, 3])
    })

    it('should parse JSON primitives', () => {
      expect(parseJson('null')).toBe(null)
      expect(parseJson('true')).toBe(true)
      expect(parseJson('false')).toBe(false)
      expect(parseJson('42')).toBe(42)
      expect(parseJson('"string"')).toBe('string')
    })

    it('should parse nested JSON objects', () => {
      const json = '{"nested":{"key":"value"},"array":[1,2,3]}'
      const result = parseJson(json)
      expect(result).toEqual({
        nested: { key: 'value' },
        array: [1, 2, 3],
      })
    })

    it('should parse empty object', () => {
      expect(parseJson('{}')).toEqual({})
    })

    it('should parse empty array', () => {
      expect(parseJson('[]')).toEqual([])
    })

    it('should parse JSON with whitespace', () => {
      const result = parseJson('  { "key" : "value" }  ')
      expect(result).toEqual({ key: 'value' })
    })

    it('should parse JSON with newlines', () => {
      const json = `{
        "key": "value",
        "number": 42
      }`
      const result = parseJson(json)
      expect(result).toEqual({ key: 'value', number: 42 })
    })
  })

  describe('Buffer support', () => {
    it('should parse JSON from Buffer', () => {
      const buffer = Buffer.from('{"key":"value"}', 'utf8')
      const result = parseJson(buffer)
      expect(result).toEqual({ key: 'value' })
    })

    it('should parse JSON from Buffer with UTF-8 encoding', () => {
      const buffer = Buffer.from('[1,2,3]', 'utf8')
      const result = parseJson(buffer)
      expect(result).toEqual([1, 2, 3])
    })

    it('should handle Buffer with BOM', () => {
      const buffer = Buffer.from('﻿{"key":"value"}', 'utf8')
      const result = parseJson(buffer)
      expect(result).toEqual({ key: 'value' })
    })

    it('should parse empty Buffer', () => {
      const buffer = Buffer.from('null', 'utf8')
      const result = parseJson(buffer)
      expect(result).toBe(null)
    })

    it('should handle empty Buffer content', () => {
      const buffer = Buffer.from('{}', 'utf8')
      const result = parseJson(buffer)
      expect(result).toEqual({})
    })

    it('should handle Buffer with nested objects', () => {
      const buffer = Buffer.from('{"a":{"b":{"c":1}}}', 'utf8')
      const result = parseJson(buffer)
      expect(result).toEqual({ a: { b: { c: 1 } } })
    })

    it('should handle Buffer with array content', () => {
      const buffer = Buffer.from('["a","b","c"]', 'utf8')
      const result = parseJson(buffer)
      expect(result).toEqual(['a', 'b', 'c'])
    })

    it('should handle Buffer with number content', () => {
      const buffer = Buffer.from('42', 'utf8')
      const result = parseJson(buffer)
      expect(result).toBe(42)
    })

    it('should handle Buffer with boolean content', () => {
      const buffer = Buffer.from('true', 'utf8')
      const result = parseJson(buffer)
      expect(result).toBe(true)
    })

    it('should handle Buffer with string content', () => {
      const buffer = Buffer.from('"hello world"', 'utf8')
      const result = parseJson(buffer)
      expect(result).toBe('hello world')
    })

    it('should throw error for invalid JSON in Buffer', () => {
      const buffer = Buffer.from('invalid json', 'utf8')
      expect(() => parseJson(buffer)).toThrow()
    })

    it('should return undefined for invalid JSON in Buffer with throws false', () => {
      const buffer = Buffer.from('invalid json', 'utf8')
      const result = parseJson(buffer, { throws: false })
      expect(result).toBe(undefined)
    })

    it('should handle Buffer with reviver', () => {
      const buffer = Buffer.from('{"num":10}', 'utf8')
      const reviver = (_key: string, value: unknown) => {
        if (typeof value === 'number') {
          return value * 2
        }
        return value
      }
      const result = parseJson(buffer, { reviver })
      expect(result).toEqual({ num: 20 })
    })

    it('should handle Buffer with filepath option', () => {
      const buffer = Buffer.from('invalid', 'utf8')
      try {
        parseJson(buffer, { filepath: '/test/buffer.json' })
        expect.fail('Should have thrown')
      } catch (e) {
        expect((e as Error).message).toContain('/test/buffer.json')
      }
    })

    it('should handle Buffer with all options', () => {
      const buffer = Buffer.from('{"value":5}', 'utf8')
      const reviver = (_key: string, value: unknown) => value
      const result = parseJson(buffer, {
        filepath: '/test.json',
        reviver,
        throws: true,
      })
      expect(result).toEqual({ value: 5 })
    })
  })

  describe('BOM stripping', () => {
    it('should strip BOM from beginning of string', () => {
      const result = parseJson('﻿{"key":"value"}')
      expect(result).toEqual({ key: 'value' })
    })

    it('should strip BOM from array', () => {
      const result = parseJson('﻿[1,2,3]')
      expect(result).toEqual([1, 2, 3])
    })

    it('should handle string without BOM', () => {
      const result = parseJson('{"key":"value"}')
      expect(result).toEqual({ key: 'value' })
    })
  })

  describe('reviver function', () => {
    it('should use reviver function to transform values', () => {
      const reviver = (_key: string, value: unknown) => {
        if (typeof value === 'number') {
          return value * 2
        }
        return value
      }
      const result = parseJson('{"a":1,"b":2}', { reviver })
      expect(result).toEqual({ a: 2, b: 4 })
    })

    it('should pass key to reviver', () => {
      const keys: string[] = []
      const reviver = (key: string, value: unknown) => {
        keys.push(key)
        return value
      }
      parseJson('{"a":1}', { reviver })
      expect(keys).toContain('a')
      expect(keys).toContain('')
    })

    it('should allow reviver to filter values', () => {
      const reviver = (key: string, value: unknown) => {
        if (key === 'filter') {
          return undefined
        }
        return value
      }
      const result = parseJson('{"keep":"yes","filter":"no"}', { reviver })
      expect(result).toEqual({ keep: 'yes' })
    })

    it('should handle reviver with nested objects', () => {
      const reviver = (key: string, value: unknown) => {
        if (key === 'nested' && typeof value === 'object') {
          return 'replaced'
        }
        return value
      }
      const result = parseJson('{"nested":{"key":"value"}}', { reviver })
      expect(result).toEqual({ nested: 'replaced' })
    })
  })

  describe('options object behavior', () => {
    it('should work with empty options object', () => {
      const result = parseJson('{"key":"value"}', {})
      expect(result).toEqual({ key: 'value' })
    })

    it('should work without options', () => {
      const result = parseJson('{"key":"value"}')
      expect(result).toEqual({ key: 'value' })
    })

    it('should work with undefined options', () => {
      const result = parseJson('{"key":"value"}', undefined)
      expect(result).toEqual({ key: 'value' })
    })

    it('should work with throws explicitly set to true', () => {
      const result = parseJson('{"key":"value"}', { throws: true })
      expect(result).toEqual({ key: 'value' })
    })

    it('should work with throws explicitly set to false', () => {
      const result = parseJson('{"key":"value"}', { throws: false })
      expect(result).toEqual({ key: 'value' })
    })

    it('should work with only reviver option', () => {
      const reviver = (_key: string, value: unknown) => value
      const result = parseJson('{"key":"value"}', { reviver })
      expect(result).toEqual({ key: 'value' })
    })

    it('should work with only filepath option', () => {
      const result = parseJson('{"key":"value"}', { filepath: '/test.json' })
      expect(result).toEqual({ key: 'value' })
    })

    it('should work with only throws option', () => {
      const result = parseJson('{"key":"value"}', { throws: false })
      expect(result).toEqual({ key: 'value' })
    })
  })

  describe('string vs Buffer edge cases', () => {
    it('should handle string with special unicode characters', () => {
      const result = parseJson('{"emoji":"😀"}')
      expect(result).toEqual({ emoji: '😀' })
    })

    it('should handle Buffer with special unicode characters', () => {
      const buffer = Buffer.from('{"emoji":"😀"}', 'utf8')
      const result = parseJson(buffer)
      expect(result).toEqual({ emoji: '😀' })
    })

    it('should handle string with escaped unicode', () => {
      const result = parseJson('{"escaped":"\\u0041\\u0042\\u0043"}')
      expect(result).toEqual({ escaped: 'ABC' })
    })

    it('should handle Buffer with escaped unicode', () => {
      const buffer = Buffer.from('{"escaped":"\\u0041\\u0042\\u0043"}', 'utf8')
      const result = parseJson(buffer)
      expect(result).toEqual({ escaped: 'ABC' })
    })

    it('should handle very long JSON string', () => {
      const longArray = Array.from({ length: 10_000 }, (_, i) => i)
      const json = JSON.stringify(longArray)
      const result = parseJson(json)
      expect(result).toEqual(longArray)
    })

    it('should handle very long JSON Buffer', () => {
      const longArray = Array.from({ length: 10_000 }, (_, i) => i)
      const json = JSON.stringify(longArray)
      const buffer = Buffer.from(json, 'utf8')
      const result = parseJson(buffer)
      expect(result).toEqual(longArray)
    })

    it('should handle whitespace-only JSON with BOM', () => {
      const result = parseJson('﻿   "value"   ')
      expect(result).toBe('value')
    })

    it('should handle Buffer with multiple BOMs in content', () => {
      // Only the first BOM should be stripped
      const buffer = Buffer.from(
        '﻿{"text":"\\uFEFF embedded BOM"}',
        'utf8',
      )
      const result = parseJson(buffer)
      expect(result).toEqual({ text: '﻿ embedded BOM' })
    })
  })
})
