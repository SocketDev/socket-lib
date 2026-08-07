/**
 * @file Unit tests for safe JSON parsing.
 *
 *   - parseJsonStrict() blocks prototype pollution attacks (**proto**,
 *     constructor, prototype)
 *   - Size limit enforcement to prevent DoS attacks via massive JSON payloads
 *   - Schema validation via Zod-compatible schemas
 *   - Handles malformed JSON, nested objects, and edge cases
 */

import { describe, expect, it } from 'vitest'
// parseJsonStrict validates Zod-shaped schemas; test must build a real
// zod schema to exercise that code path.
// oxlint-disable-next-line socket/prefer-typebox-schema -- zod needed
import { z } from 'zod'

import { parseJsonStrict } from '../../../src/json/parse'

describe('json/safe-parse', () => {
  describe('parseJsonStrict', () => {
    it('should parse valid JSON', () => {
      const result = parseJsonStrict('{"name":"test","value":123}')
      expect(result).toEqual({ name: 'test', value: 123 })
    })

    it('should parse arrays', () => {
      expect(parseJsonStrict('[1,2,3]')).toEqual([1, 2, 3])
    })

    it('should parse strings', () => {
      expect(parseJsonStrict('"hello"')).toBe('hello')
    })

    it('should parse numbers', () => {
      expect(parseJsonStrict('42')).toBe(42)
    })

    it('should parse booleans', () => {
      expect(parseJsonStrict('true')).toBe(true)
      expect(parseJsonStrict('false')).toBe(false)
    })

    it('should parse null', () => {
      expect(parseJsonStrict('null')).toBeNull()
    })

    it('should handle empty objects and arrays', () => {
      expect(parseJsonStrict('{}')).toEqual({})
      expect(parseJsonStrict('[]')).toEqual([])
    })

    it('should throw on invalid JSON', () => {
      expect(() => parseJsonStrict('not valid json')).toThrow(/Failed to parse/)
    })

    it('should handle deeply nested JSON', () => {
      const json = '{"a":{"b":{"c":{"d":{"e":"value"}}}}}'
      const result = parseJsonStrict<{
        a: { b: { c: { d: { e: string } } } }
      }>(json)
      expect(result.a.b.c.d.e).toBe('value')
    })

    it('should handle mixed arrays', () => {
      const json = '[1,"string",true,null,{"obj":true}]'
      const result = parseJsonStrict(json)
      expect(result).toEqual([1, 'string', true, null, { obj: true }])
    })
  })

  describe('prototype pollution protection', () => {
    it('should block __proto__ key at top level', () => {
      expect(() => parseJsonStrict('{"__proto__":{"polluted":true}}')).toThrow(
        /prototype pollution/,
      )
    })

    it('should block constructor key at top level', () => {
      expect(() =>
        parseJsonStrict('{"constructor":{"prototype":{"polluted":true}}}'),
      ).toThrow(/prototype pollution/)
    })

    it('should block prototype key at top level', () => {
      expect(() => parseJsonStrict('{"prototype":{"polluted":true}}')).toThrow(
        /prototype pollution/,
      )
    })

    it('should block __proto__ at any depth', () => {
      expect(() =>
        parseJsonStrict('{"a":{"b":{"__proto__":{"polluted":true}}}}'),
      ).toThrow(/prototype pollution/)
    })

    it('should allow pollution keys when allowPrototype is true', () => {
      const result = parseJsonStrict('{"__proto__":{"x":1}}', undefined, {
        allowPrototype: true,
      })
      expect(result).toBeDefined()
    })
  })

  describe('size limit enforcement', () => {
    it('should throw when JSON exceeds maxSize', () => {
      const large = JSON.stringify({ data: 'x'.repeat(1000) })
      expect(() => parseJsonStrict(large, undefined, { maxSize: 100 })).toThrow(
        /exceeds maximum size/,
      )
    })

    it('includes byte-count detail in error when maxSize differs from default', () => {
      const large = JSON.stringify({ data: 'x'.repeat(1000) })
      expect(() => parseJsonStrict(large, undefined, { maxSize: 100 })).toThrow(
        /of 100 bytes/,
      )
    })

    it('should succeed within maxSize', () => {
      const small = JSON.stringify({ data: 'x'.repeat(10) })
      expect(parseJsonStrict(small, undefined, { maxSize: 100 })).toEqual({
        data: 'x'.repeat(10),
      })
    })

    it('should use default 10MB limit', () => {
      const small = '{"x":1}'
      expect(parseJsonStrict(small)).toEqual({ x: 1 })
    })
  })

  describe('schema validation', () => {
    it('should validate against zod schema', () => {
      const userSchema = z.object({
        name: z.string(),
        age: z.number(),
      })
      const json = '{"name":"Alice","age":30}'
      const result = parseJsonStrict(json, userSchema)
      expect(result).toEqual({ name: 'Alice', age: 30 })
    })

    it('should throw on schema validation failure', () => {
      const userSchema = z.object({
        name: z.string(),
        age: z.number(),
      })
      const json = '{"name":"Alice","age":"invalid"}'
      expect(() => parseJsonStrict(json, userSchema)).toThrow(
        /Validation failed/,
      )
    })

    it('should include field path in validation error', () => {
      const schema = z.object({
        required: z.string(),
      })
      const json = '{}'
      expect(() => parseJsonStrict(json, schema)).toThrow(/required/)
    })

    it('should handle nested schema', () => {
      const schema = z.object({
        user: z.object({
          name: z.string(),
          email: z.string().email(),
        }),
      })
      const json = '{"user":{"name":"Test","email":"test@example.com"}}'
      const result = parseJsonStrict(json, schema)
      expect(result.user.name).toBe('Test')
    })

    it('should handle array schema validation', () => {
      const schema = z.array(z.number())
      expect(parseJsonStrict('[1,2,3,4,5]', schema)).toEqual([1, 2, 3, 4, 5])
    })

    it('should throw on invalid array items', () => {
      const schema = z.array(z.number())
      expect(() => parseJsonStrict('[1,2,"string",4]', schema)).toThrow(
        /Validation failed/,
      )
    })
  })
})
