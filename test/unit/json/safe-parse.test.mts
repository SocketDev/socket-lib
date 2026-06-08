/**
 * @file Unit tests for safe JSON parsing.
 *
 *   - parseJsonSafe() blocks prototype pollution attacks (**proto**, constructor,
 *     prototype)
 *   - Size limit enforcement to prevent DoS attacks via massive JSON payloads
 *   - Schema validation via Zod-compatible schemas
 *   - Handles malformed JSON, nested objects, and edge cases
 */

import { describe, expect, it } from 'vitest'
// socket-lint: allow schema-lib -- parseJsonSafe validates Zod-shaped schemas; this test must build a real zod schema to exercise that path.
import { z } from 'zod'

import { parseJsonSafe } from '../../../src/json/parse'

describe('json/safe-parse', () => {
  describe('parseJsonSafe', () => {
    it('should parse valid JSON', () => {
      const result = parseJsonSafe('{"name":"test","value":123}')
      expect(result).toEqual({ name: 'test', value: 123 })
    })

    it('should parse arrays', () => {
      expect(parseJsonSafe('[1,2,3]')).toEqual([1, 2, 3])
    })

    it('should parse strings', () => {
      expect(parseJsonSafe('"hello"')).toBe('hello')
    })

    it('should parse numbers', () => {
      expect(parseJsonSafe('42')).toBe(42)
    })

    it('should parse booleans', () => {
      expect(parseJsonSafe('true')).toBe(true)
      expect(parseJsonSafe('false')).toBe(false)
    })

    it('should parse null', () => {
      expect(parseJsonSafe('null')).toBeNull()
    })

    it('should handle empty objects and arrays', () => {
      expect(parseJsonSafe('{}')).toEqual({})
      expect(parseJsonSafe('[]')).toEqual([])
    })

    it('should throw on invalid JSON', () => {
      expect(() => parseJsonSafe('not valid json')).toThrow(/Failed to parse/)
    })

    it('should handle deeply nested JSON', () => {
      const json = '{"a":{"b":{"c":{"d":{"e":"value"}}}}}'
      const result = parseJsonSafe<{
        a: { b: { c: { d: { e: string } } } }
      }>(json)
      expect(result.a.b.c.d.e).toBe('value')
    })

    it('should handle mixed arrays', () => {
      const json = '[1,"string",true,null,{"obj":true}]'
      const result = parseJsonSafe(json)
      expect(result).toEqual([1, 'string', true, null, { obj: true }])
    })
  })

  describe('prototype pollution protection', () => {
    it('should block __proto__ key at top level', () => {
      expect(() => parseJsonSafe('{"__proto__":{"polluted":true}}')).toThrow(
        /prototype pollution/,
      )
    })

    it('should block constructor key at top level', () => {
      expect(() =>
        parseJsonSafe('{"constructor":{"prototype":{"polluted":true}}}'),
      ).toThrow(/prototype pollution/)
    })

    it('should block prototype key at top level', () => {
      expect(() => parseJsonSafe('{"prototype":{"polluted":true}}')).toThrow(
        /prototype pollution/,
      )
    })

    it('should block __proto__ at any depth', () => {
      expect(() =>
        parseJsonSafe('{"a":{"b":{"__proto__":{"polluted":true}}}}'),
      ).toThrow(/prototype pollution/)
    })

    it('should allow pollution keys when allowPrototype is true', () => {
      const result = parseJsonSafe('{"__proto__":{"x":1}}', undefined, {
        allowPrototype: true,
      })
      expect(result).toBeDefined()
    })
  })

  describe('size limit enforcement', () => {
    it('should throw when JSON exceeds maxSize', () => {
      const large = JSON.stringify({ data: 'x'.repeat(1000) })
      expect(() => parseJsonSafe(large, undefined, { maxSize: 100 })).toThrow(
        /exceeds maximum size/,
      )
    })

    it('includes byte-count detail in error when maxSize differs from default', () => {
      const large = JSON.stringify({ data: 'x'.repeat(1000) })
      expect(() => parseJsonSafe(large, undefined, { maxSize: 100 })).toThrow(
        /of 100 bytes/,
      )
    })

    it('should succeed within maxSize', () => {
      const small = JSON.stringify({ data: 'x'.repeat(10) })
      expect(parseJsonSafe(small, undefined, { maxSize: 100 })).toEqual({
        data: 'x'.repeat(10),
      })
    })

    it('should use default 10MB limit', () => {
      const small = '{"x":1}'
      expect(parseJsonSafe(small)).toEqual({ x: 1 })
    })
  })

  describe('schema validation', () => {
    it('should validate against zod schema', () => {
      const userSchema = z.object({
        name: z.string(),
        age: z.number(),
      })
      const json = '{"name":"Alice","age":30}'
      const result = parseJsonSafe(json, userSchema)
      expect(result).toEqual({ name: 'Alice', age: 30 })
    })

    it('should throw on schema validation failure', () => {
      const userSchema = z.object({
        name: z.string(),
        age: z.number(),
      })
      const json = '{"name":"Alice","age":"invalid"}'
      expect(() => parseJsonSafe(json, userSchema)).toThrow(/Validation failed/)
    })

    it('should include field path in validation error', () => {
      const schema = z.object({
        required: z.string(),
      })
      const json = '{}'
      expect(() => parseJsonSafe(json, schema)).toThrow(/required/)
    })

    it('should handle nested schema', () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
      })
      const json = '{"user":{"name":"Test","email":"test@example.com"}}'
      const result = parseJsonSafe(json, schema)
      expect(result.user.name).toBe('Test')
    })

    it('should handle array schema validation', () => {
      const schema = z.array(z.number())
      expect(parseJsonSafe('[1,2,3,4,5]', schema)).toEqual([1, 2, 3, 4, 5])
    })

    it('should throw on invalid array items', () => {
      const schema = z.array(z.number())
      expect(() => parseJsonSafe('[1,2,"string",4]', schema)).toThrow(
        /Validation failed/,
      )
    })
  })
})
