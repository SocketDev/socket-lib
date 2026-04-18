/**
 * @fileoverview Unit tests for safe JSON parsing.
 *
 * - safeJsonParse() blocks prototype pollution attacks (__proto__, constructor, prototype)
 * - Size limit enforcement to prevent DoS attacks via massive JSON payloads
 * - Schema validation via Zod-compatible schemas
 * - Handles malformed JSON, nested objects, and edge cases
 */

import { describe, expect, it } from 'vitest'
import { z } from 'zod'

import { safeJsonParse } from '@socketsecurity/lib/validation/json-parser'

describe('validation/json-parser', () => {
  describe('safeJsonParse', () => {
    it('should parse valid JSON', () => {
      const result = safeJsonParse('{"name":"test","value":123}')
      expect(result).toEqual({ name: 'test', value: 123 })
    })

    it('should parse arrays', () => {
      expect(safeJsonParse('[1,2,3]')).toEqual([1, 2, 3])
    })

    it('should parse strings', () => {
      expect(safeJsonParse('"hello"')).toBe('hello')
    })

    it('should parse numbers', () => {
      expect(safeJsonParse('42')).toBe(42)
    })

    it('should parse booleans', () => {
      expect(safeJsonParse('true')).toBe(true)
      expect(safeJsonParse('false')).toBe(false)
    })

    it('should parse null', () => {
      expect(safeJsonParse('null')).toBeNull()
    })

    it('should handle empty objects and arrays', () => {
      expect(safeJsonParse('{}')).toEqual({})
      expect(safeJsonParse('[]')).toEqual([])
    })

    it('should throw on invalid JSON', () => {
      expect(() => safeJsonParse('not valid json')).toThrow(/Failed to parse/)
    })

    it('should handle deeply nested JSON', () => {
      const json = '{"a":{"b":{"c":{"d":{"e":"value"}}}}}'
      const result = safeJsonParse<{
        a: { b: { c: { d: { e: string } } } }
      }>(json)
      expect(result.a.b.c.d.e).toBe('value')
    })

    it('should handle mixed arrays', () => {
      const json = '[1,"string",true,null,{"obj":true}]'
      const result = safeJsonParse(json)
      expect(result).toEqual([1, 'string', true, null, { obj: true }])
    })
  })

  describe('prototype pollution protection', () => {
    it('should block __proto__ key at top level', () => {
      expect(() => safeJsonParse('{"__proto__":{"polluted":true}}')).toThrow(
        /prototype pollution/,
      )
    })

    it('should block constructor key at top level', () => {
      expect(() =>
        safeJsonParse('{"constructor":{"prototype":{"polluted":true}}}'),
      ).toThrow(/prototype pollution/)
    })

    it('should block prototype key at top level', () => {
      expect(() => safeJsonParse('{"prototype":{"polluted":true}}')).toThrow(
        /prototype pollution/,
      )
    })

    it('should block __proto__ at any depth', () => {
      expect(() =>
        safeJsonParse('{"a":{"b":{"__proto__":{"polluted":true}}}}'),
      ).toThrow(/prototype pollution/)
    })

    it('should allow pollution keys when allowPrototype is true', () => {
      const result = safeJsonParse('{"__proto__":{"x":1}}', undefined, {
        allowPrototype: true,
      })
      expect(result).toBeDefined()
    })
  })

  describe('size limit enforcement', () => {
    it('should throw when JSON exceeds maxSize', () => {
      const large = JSON.stringify({ data: 'x'.repeat(1000) })
      expect(() => safeJsonParse(large, undefined, { maxSize: 100 })).toThrow(
        /exceeds maximum size/,
      )
    })

    it('should succeed within maxSize', () => {
      const small = JSON.stringify({ data: 'x'.repeat(10) })
      expect(safeJsonParse(small, undefined, { maxSize: 100 })).toEqual({
        data: 'x'.repeat(10),
      })
    })

    it('should use default 10MB limit', () => {
      const small = '{"x":1}'
      expect(safeJsonParse(small)).toEqual({ x: 1 })
    })
  })

  describe('schema validation', () => {
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

    it('should include field path in validation error', () => {
      const schema = z.object({
        required: z.string(),
      })
      const json = '{}'
      expect(() => safeJsonParse(json, schema)).toThrow(/required/)
    })

    it('should handle nested schema', () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
      })
      const json = '{"user":{"name":"Test","email":"test@example.com"}}'
      const result = safeJsonParse(json, schema)
      expect(result.user.name).toBe('Test')
    })

    it('should handle array schema validation', () => {
      const schema = z.array(z.number())
      expect(safeJsonParse('[1,2,3,4,5]', schema)).toEqual([1, 2, 3, 4, 5])
    })

    it('should throw on invalid array items', () => {
      const schema = z.array(z.number())
      expect(() => safeJsonParse('[1,2,"string",4]', schema)).toThrow(
        /Validation failed/,
      )
    })
  })
})
