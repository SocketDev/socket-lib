/**
 * @fileoverview Unit tests for JSON validation and parsing utilities.
 *
 * Tests secure JSON parsing with protection against common vulnerabilities:
 * - safeJsonParse() blocks prototype pollution attacks (__proto__, constructor, prototype)
 * - tryJsonParse() provides non-throwing JSON parsing with undefined fallback
 * - Size limit enforcement to prevent DoS attacks via massive JSON payloads
 * - Reviver function support for custom parsing logic
 * - Handles malformed JSON, nested objects, and edge cases
 * - Validates security controls work correctly while allowing legitimate data
 */

import {
  createJsonParser,
  parseJsonWithResult,
  parseNdjson,
  safeJsonParse,
  streamNdjson,
  tryJsonParse,
} from '@socketsecurity/lib/validation/json-parser'
import { describe, expect, it } from 'vitest'
import { z } from 'zod'

describe('validation/json-parser', () => {
  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      const result = safeJsonParse('{"name":"test","value":123}')
      expect(result).toEqual({ name: 'test', value: 123 })
    })

    it('should parse JSON arrays', () => {
      const result = safeJsonParse('[1,2,3,4,5]')
      expect(result).toEqual([1, 2, 3, 4, 5])
    })

    it('should parse JSON primitives', () => {
      expect(safeJsonParse('true')).toBe(true)
      expect(safeJsonParse('false')).toBe(false)
      expect(safeJsonParse('null')).toBe(null)
      expect(safeJsonParse('42')).toBe(42)
      expect(safeJsonParse('"string"')).toBe('string')
    })

    it('should throw on invalid JSON', () => {
      expect(() => safeJsonParse('invalid json')).toThrow()
      expect(() => safeJsonParse('{invalid}')).toThrow()
    })

    it('should throw on prototype pollution attempts', () => {
      expect(() => safeJsonParse('{"__proto__":{"isAdmin":true}}')).toThrow(
        /prototype pollution/,
      )
      expect(() => safeJsonParse('{"constructor":{"key":"value"}}')).toThrow(
        /prototype pollution/,
      )
      expect(() => safeJsonParse('{"prototype":{"key":"value"}}')).toThrow(
        /prototype pollution/,
      )
    })

    it('should allow prototype keys when allowPrototype is true', () => {
      const result = safeJsonParse('{"__proto__":{"test":true}}', undefined, {
        allowPrototype: true,
      })
      expect(result).toBeDefined()
    })

    it('should throw on size limit exceeded', () => {
      const largeJson = JSON.stringify({ data: 'x'.repeat(1000) })
      expect(() =>
        safeJsonParse(largeJson, undefined, { maxSize: 100 }),
      ).toThrow(/exceeds maximum size/)
    })

    it('should accept JSON within size limit', () => {
      const smallJson = JSON.stringify({ data: 'test' })
      const result = safeJsonParse(smallJson, undefined, { maxSize: 1000 })
      expect(result).toEqual({ data: 'test' })
    })

    it('should handle nested objects', () => {
      const json = '{"level1":{"level2":{"level3":"value"}}}'
      const result = safeJsonParse(json)
      expect(result).toEqual({ level1: { level2: { level3: 'value' } } })
    })

    it('should handle arrays in objects', () => {
      const json = '{"items":[1,2,3],"nested":{"arr":[4,5,6]}}'
      const result = safeJsonParse(json)
      expect(result).toEqual({
        items: [1, 2, 3],
        nested: { arr: [4, 5, 6] },
      })
    })

    it('should handle empty objects and arrays', () => {
      expect(safeJsonParse('{}')).toEqual({})
      expect(safeJsonParse('[]')).toEqual([])
    })
  })

  describe('tryJsonParse', () => {
    it('should parse valid JSON', () => {
      const result = tryJsonParse('{"name":"test"}')
      expect(result).toEqual({ name: 'test' })
    })

    it('should return undefined on invalid JSON', () => {
      const result = tryJsonParse('invalid json')
      expect(result).toBeUndefined()
    })

    it('should return undefined on prototype pollution', () => {
      const result = tryJsonParse('{"__proto__":{"isAdmin":true}}')
      expect(result).toBeUndefined()
    })

    it('should return undefined on size limit exceeded', () => {
      const largeJson = JSON.stringify({ data: 'x'.repeat(1000) })
      const result = tryJsonParse(largeJson, undefined, { maxSize: 100 })
      expect(result).toBeUndefined()
    })

    it('should successfully parse within limits', () => {
      const result = tryJsonParse('{"test":true}')
      expect(result).toEqual({ test: true })
    })
  })

  describe('error handling with tryJsonParse', () => {
    it('should return undefined for various error conditions', () => {
      // Already covered in tryJsonParse tests above
      expect(tryJsonParse('invalid')).toBeUndefined()
    })
  })

  describe('edge cases', () => {
    it('should handle deeply nested JSON', () => {
      const json = '{"a":{"b":{"c":{"d":{"e":"value"}}}}}'
      const result = safeJsonParse(json)
      expect(result).toEqual({ a: { b: { c: { d: { e: 'value' } } } } })
    })

    it('should handle special characters', () => {
      const json = '{"text":"hello\\nworld\\t!"}'
      const result = safeJsonParse(json)
      expect(result).toEqual({ text: 'hello\nworld\t!' })
    })

    it('should handle unicode', () => {
      const json = '{"emoji":"😀","chinese":"你好"}'
      const result = safeJsonParse(json)
      expect(result).toEqual({ emoji: '😀', chinese: '你好' })
    })

    it('should handle numbers correctly', () => {
      const json = '{"int":42,"float":3.14,"neg":-1,"exp":1e10}'
      const result = safeJsonParse(json)
      expect(result).toEqual({ int: 42, float: 3.14, neg: -1, exp: 1e10 })
    })

    it('should handle mixed arrays', () => {
      const json = '[1,"string",true,null,{"obj":true}]'
      const result = safeJsonParse(json)
      expect(result).toEqual([1, 'string', true, null, { obj: true }])
    })
  })

  describe('safeJsonParse with schema validation', () => {
    it('should validate against zod schema', () => {
      const userSchema = z.object({
        name: z.string(),
        age: z.number(),
      })
      const json = '{"name":"Alice","age":30}'
      const result = safeJsonParse(json, userSchema)
      expect(result).toEqual({ name: 'Alice', age: 30 })
    })

    it('should throw on schema validation failure', () => {
      const userSchema = z.object({
        name: z.string(),
        age: z.number(),
      })
      const json = '{"name":"Alice","age":"invalid"}'
      expect(() => safeJsonParse(json, userSchema)).toThrow(/Validation failed/)
    })

    it('should include validation error details', () => {
      const schema = z.object({
        required: z.string(),
      })
      const json = '{}'
      expect(() => safeJsonParse(json, schema)).toThrow(/required/)
    })

    it('should handle complex schema with nested objects', () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
        metadata: z.object({
          createdAt: z.string(),
        }),
      })
      const json =
        '{"user":{"name":"Test","email":"test@example.com"},"metadata":{"createdAt":"2024-01-01"}}'
      const result = safeJsonParse(json, schema)
      expect(result.user.name).toBe('Test')
      expect(result.user.email).toBe('test@example.com')
    })

    it('should handle array schema validation', () => {
      const schema = z.array(z.number())
      const json = '[1,2,3,4,5]'
      const result = safeJsonParse(json, schema)
      expect(result).toEqual([1, 2, 3, 4, 5])
    })

    it('should throw on invalid array items', () => {
      const schema = z.array(z.number())
      const json = '[1,2,"string",4]'
      expect(() => safeJsonParse(json, schema)).toThrow(/Validation failed/)
    })
  })

  describe('parseJsonWithResult', () => {
    it('should return success result for valid JSON', () => {
      const result = parseJsonWithResult('{"name":"test"}')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual({ name: 'test' })
      }
    })

    it('should return error result for invalid JSON', () => {
      const result = parseJsonWithResult('invalid json')
      expect(result.success).toBe(false)
      expect(result).toHaveProperty('error')
      expect((result as { success: false; error: string }).error).toContain(
        'Failed to parse JSON',
      )
    })

    it('should return error result for prototype pollution', () => {
      const result = parseJsonWithResult('{"__proto__":{"isAdmin":true}}')
      expect(result.success).toBe(false)
      expect(result).toHaveProperty('error')
      expect((result as { success: false; error: string }).error).toContain(
        'prototype pollution',
      )
    })

    it('should return error result for size limit', () => {
      const largeJson = JSON.stringify({ data: 'x'.repeat(1000) })
      const result = parseJsonWithResult(largeJson, undefined, { maxSize: 100 })
      expect(result.success).toBe(false)
      expect(result).toHaveProperty('error')
      expect((result as { success: false; error: string }).error).toContain(
        'exceeds maximum size',
      )
    })

    it('should work with schema validation success', () => {
      const schema = z.object({ value: z.number() })
      const result = parseJsonWithResult('{"value":42}', schema)
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data.value).toBe(42)
      }
    })

    it('should return error for schema validation failure', () => {
      const schema = z.object({ value: z.number() })
      const result = parseJsonWithResult('{"value":"string"}', schema)
      expect(result.success).toBe(false)
      expect(result).toHaveProperty('error')
      expect((result as { success: false; error: string }).error).toContain(
        'Validation failed',
      )
    })

    it('should handle arrays with result', () => {
      const result = parseJsonWithResult('[1,2,3]')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toEqual([1, 2, 3])
      }
    })

    it('should handle primitives with result', () => {
      const result = parseJsonWithResult('true')
      expect(result.success).toBe(true)
      if (result.success) {
        expect(result.data).toBe(true)
      }
    })
  })

  describe('createJsonParser', () => {
    it('should create a reusable parser', () => {
      const parser = createJsonParser()
      const result1 = parser('{"a":1}')
      const result2 = parser('{"b":2}')
      expect(result1).toEqual({ a: 1 })
      expect(result2).toEqual({ b: 2 })
    })

    it('should create parser with schema', () => {
      const schema = z.object({ name: z.string() })
      const parser = createJsonParser(schema)
      const result = parser('{"name":"test"}')
      expect(result).toEqual({ name: 'test' })
    })

    it('should create parser with default options', () => {
      const parser = createJsonParser(undefined, { maxSize: 1000 })
      const smallJson = '{"data":"test"}'
      const result = parser(smallJson)
      expect(result).toEqual({ data: 'test' })
    })

    it('should allow overriding options per call', () => {
      const parser = createJsonParser(undefined, { maxSize: 100 })
      const largeJson = JSON.stringify({ data: 'x'.repeat(200) })
      // Override maxSize for this call
      const result = parser(largeJson, { maxSize: 10_000 })
      expect(result).toHaveProperty('data')
    })

    it('should throw from created parser on invalid JSON', () => {
      const parser = createJsonParser()
      expect(() => parser('invalid')).toThrow()
    })

    it('should work with schema validation in created parser', () => {
      const schema = z.object({
        count: z.number(),
      })
      const parser = createJsonParser(schema)
      expect(() => parser('{"count":"invalid"}')).toThrow(/Validation failed/)
    })

    it('should preserve default options across calls', () => {
      const parser = createJsonParser(undefined, {
        maxSize: 100,
        allowPrototype: false,
      })
      const largeJson = JSON.stringify({ data: 'x'.repeat(200) })
      expect(() => parser(largeJson)).toThrow(/exceeds maximum size/)
    })
  })

  describe('parseNdjson', () => {
    it('should parse newline-delimited JSON', () => {
      const ndjson = '{"a":1}\n{"b":2}\n{"c":3}'
      const result = parseNdjson(ndjson)
      expect(result).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }])
    })

    it('should handle \\r\\n line endings', () => {
      const ndjson = '{"a":1}\r\n{"b":2}\r\n{"c":3}'
      const result = parseNdjson(ndjson)
      expect(result).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }])
    })

    it('should skip empty lines', () => {
      const ndjson = '{"a":1}\n\n{"b":2}\n\n\n{"c":3}\n'
      const result = parseNdjson(ndjson)
      expect(result).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }])
    })

    it('should skip lines with only whitespace', () => {
      const ndjson = '{"a":1}\n   \n{"b":2}\n\t\t\n{"c":3}'
      const result = parseNdjson(ndjson)
      expect(result).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }])
    })

    it('should throw on invalid JSON line with line number', () => {
      const ndjson = '{"a":1}\ninvalid\n{"c":3}'
      expect(() => parseNdjson(ndjson)).toThrow(/line 2/)
    })

    it('should validate with schema', () => {
      const schema = z.object({ value: z.number() })
      const ndjson = '{"value":1}\n{"value":2}\n{"value":3}'
      const result = parseNdjson(ndjson, schema)
      expect(result).toEqual([{ value: 1 }, { value: 2 }, { value: 3 }])
    })

    it('should throw on schema validation failure with line number', () => {
      const schema = z.object({ value: z.number() })
      const ndjson = '{"value":1}\n{"value":"invalid"}\n{"value":3}'
      expect(() => parseNdjson(ndjson, schema)).toThrow(/line 2/)
    })

    it('should respect size limits per line', () => {
      const ndjson = `{"small":"data"}\n{"large":"${'x'.repeat(1000)}"}`
      expect(() => parseNdjson(ndjson, undefined, { maxSize: 100 })).toThrow(
        /line 2/,
      )
    })

    it('should handle empty NDJSON string', () => {
      const result = parseNdjson('')
      expect(result).toEqual([])
    })

    it('should handle NDJSON with only newlines', () => {
      const result = parseNdjson('\n\n\n')
      expect(result).toEqual([])
    })

    it('should handle mixed types in NDJSON', () => {
      const ndjson = '{"type":"object"}\n[1,2,3]\n"string"\n42\ntrue'
      const result = parseNdjson(ndjson)
      expect(result).toEqual([
        { type: 'object' },
        [1, 2, 3],
        'string',
        42,
        true,
      ])
    })

    it('should handle complex objects in NDJSON', () => {
      const ndjson =
        '{"user":{"name":"Alice","age":30}}\n{"user":{"name":"Bob","age":25}}'
      const result = parseNdjson(ndjson)
      expect(result).toEqual([
        { user: { name: 'Alice', age: 30 } },
        { user: { name: 'Bob', age: 25 } },
      ])
    })
  })

  describe('streamNdjson', () => {
    it('should yield parsed objects one at a time', () => {
      const ndjson = '{"a":1}\n{"b":2}\n{"c":3}'
      const results = [...streamNdjson(ndjson)]
      expect(results).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }])
    })

    it('should handle \\r\\n line endings in generator', () => {
      const ndjson = '{"a":1}\r\n{"b":2}\r\n{"c":3}'
      const results = [...streamNdjson(ndjson)]
      expect(results).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }])
    })

    it('should skip empty lines in generator', () => {
      const ndjson = '{"a":1}\n\n{"b":2}\n\n{"c":3}'
      const results = [...streamNdjson(ndjson)]
      expect(results).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }])
    })

    it('should throw on invalid JSON with line number', () => {
      const ndjson = '{"a":1}\ninvalid\n{"c":3}'
      const generator = streamNdjson(ndjson)
      expect(generator.next().value).toEqual({ a: 1 })
      expect(() => generator.next()).toThrow(/line 2/)
    })

    it('should allow early termination', () => {
      const ndjson = '{"a":1}\n{"b":2}\n{"c":3}\n{"d":4}\n{"e":5}'
      const results = []
      for (const item of streamNdjson(ndjson)) {
        results.push(item)
        if (Object.keys(item)[0] === 'c') {
          break
        }
      }
      expect(results).toEqual([{ a: 1 }, { b: 2 }, { c: 3 }])
    })

    it('should validate with schema in generator', () => {
      const schema = z.object({ value: z.number() })
      const ndjson = '{"value":1}\n{"value":2}\n{"value":3}'
      const results = [...streamNdjson(ndjson, schema)]
      expect(results).toEqual([{ value: 1 }, { value: 2 }, { value: 3 }])
    })

    it('should throw on schema validation failure', () => {
      const schema = z.object({ value: z.number() })
      const ndjson = '{"value":1}\n{"value":"invalid"}'
      const generator = streamNdjson(ndjson, schema)
      expect(generator.next().value).toEqual({ value: 1 })
      expect(() => generator.next()).toThrow(/Validation failed/)
    })

    it('should handle empty NDJSON in generator', () => {
      const results = [...streamNdjson('')]
      expect(results).toEqual([])
    })

    it('should handle whitespace-only lines', () => {
      const ndjson = '{"a":1}\n   \n{"b":2}'
      const results = [...streamNdjson(ndjson)]
      expect(results).toEqual([{ a: 1 }, { b: 2 }])
    })

    it('should work with for-of loop', () => {
      const ndjson = '{"count":1}\n{"count":2}\n{"count":3}'
      let sum = 0
      for (const item of streamNdjson<{ count: number }>(ndjson)) {
        sum += item.count
      }
      expect(sum).toBe(6)
    })

    it('should handle generator spread correctly', () => {
      const ndjson = '1\n2\n3\n4\n5'
      const numbers = [...streamNdjson<number>(ndjson)]
      expect(numbers).toEqual([1, 2, 3, 4, 5])
    })

    it('should respect size limits in generator', () => {
      const ndjson = `{"small":"data"}\n{"large":"${'x'.repeat(1000)}"}`
      const generator = streamNdjson(ndjson, undefined, { maxSize: 100 })
      expect(generator.next().value).toEqual({ small: 'data' })
      expect(() => generator.next()).toThrow(/exceeds maximum size/)
    })
  })
})
