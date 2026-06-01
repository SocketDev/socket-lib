/**
 * @file Unit tests for src/json/parse — parseJson error handling, edge cases,
 *   and the internal isBuffer guard. Split out of test/unit/json/parse.test.mts
 *   to keep each test file under the fleet's 500-line soft cap.
 */

import { describe, expect, it } from 'vitest'

import { parseJson } from '../../../src/json/parse'

describe('parseJson error handling and edge cases', () => {
  describe('error handling with throws option', () => {
    it('should throw error for invalid JSON by default', () => {
      expect(() => parseJson('invalid json')).toThrow()
    })

    it('should throw error when throws is true', () => {
      expect(() => parseJson('invalid json', { throws: true })).toThrow()
    })

    it('should throw error when throws is explicitly undefined', () => {
      expect(() => parseJson('invalid json', { throws: undefined })).toThrow()
    })

    it('should return undefined when throws is false', () => {
      const result = parseJson('invalid json', { throws: false })
      expect(result).toBe(undefined)
    })

    it('should throw for malformed JSON object', () => {
      expect(() => parseJson('{invalid}')).toThrow()
    })

    it('should throw for unclosed JSON object', () => {
      expect(() => parseJson('{"key":"value"')).toThrow()
    })

    it('should throw for unclosed JSON array', () => {
      expect(() => parseJson('[1,2,3')).toThrow()
    })

    it('should throw for trailing comma', () => {
      expect(() => parseJson('{"key":"value",}')).toThrow()
    })

    it('should throw for single quotes', () => {
      expect(() => parseJson("{'key':'value'}")).toThrow()
    })

    it('should return undefined for empty string with throws false', () => {
      const result = parseJson('', { throws: false })
      expect(result).toBe(undefined)
    })

    it('should throw for empty string by default', () => {
      expect(() => parseJson('')).toThrow()
    })
  })

  describe('error handling with filepath option', () => {
    it('should include filepath in error message', () => {
      const filepath = '/path/to/file.json'
      try {
        parseJson('invalid json', { filepath })
        expect.fail('Should have thrown')
      } catch (e) {
        expect((e as Error).message).toContain(filepath)
      }
    })

    it('should prepend filepath to error message', () => {
      const filepath = '/test/file.json'
      try {
        parseJson('{invalid}', { filepath })
        expect.fail('Should have thrown')
      } catch (e) {
        expect((e as Error).message).toMatch(/^\/test\/file\.json:/)
      }
    })

    it('should work with Buffer and filepath', () => {
      const buffer = Buffer.from('invalid json', 'utf8')
      const filepath = '/path/to/buffer.json'
      try {
        parseJson(buffer, { filepath })
        expect.fail('Should have thrown')
      } catch (e) {
        expect((e as Error).message).toContain(filepath)
      }
    })

    it('should not modify error when throws is false', () => {
      const result = parseJson('invalid', {
        filepath: '/test.json',
        throws: false,
      })
      expect(result).toBe(undefined)
    })

    it('should handle empty filepath', () => {
      try {
        parseJson('invalid', { filepath: '' })
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(Error)
      }
    })
  })

  describe('combined options', () => {
    it('should use reviver with filepath', () => {
      const reviver = (_key: string, value: unknown) => value
      const result = parseJson('{"key":"value"}', {
        filepath: '/test.json',
        reviver,
      })
      expect(result).toEqual({ key: 'value' })
    })

    it('should use reviver with throws false', () => {
      const reviver = (_key: string, value: unknown) => value
      const result = parseJson('{"key":"value"}', {
        throws: false,
        reviver,
      })
      expect(result).toEqual({ key: 'value' })
    })

    it('should use all options together', () => {
      const reviver = (_key: string, value: unknown) => value
      const result = parseJson('{"key":"value"}', {
        filepath: '/test.json',
        throws: true,
        reviver,
      })
      expect(result).toEqual({ key: 'value' })
    })

    it('should handle error with all options', () => {
      const reviver = (_key: string, value: unknown) => value
      const result = parseJson('invalid', {
        filepath: '/test.json',
        throws: false,
        reviver,
      })
      expect(result).toBe(undefined)
    })
  })

  describe('edge cases', () => {
    it('should parse JSON with special characters', () => {
      const json = '{"special":"\\n\\t\\r\\b\\f\\"\\\\/"}'
      const result = parseJson(json)
      expect(result).toEqual({ special: '\n\t\r\b\f"\\/' })
    })

    it('should parse JSON with unicode escapes', () => {
      const json = '{"unicode":"\\u0048\\u0065\\u006c\\u006c\\u006f"}'
      const result = parseJson(json)
      expect(result).toEqual({ unicode: 'Hello' })
    })

    it('should parse JSON with negative numbers', () => {
      const result = parseJson('{"negative":-42}')
      expect(result).toEqual({ negative: -42 })
    })

    it('should parse JSON with scientific notation', () => {
      const result = parseJson('{"scientific":1.23e10}')
      expect(result).toEqual({ scientific: 1.23e10 })
    })

    it('should parse JSON with very nested structure', () => {
      const json = '{"a":{"b":{"c":{"d":{"e":"deep"}}}}}'
      const result = parseJson(json)
      expect(result).toEqual({ a: { b: { c: { d: { e: 'deep' } } } } })
    })

    it('should parse large array', () => {
      const array = Array.from({ length: 1000 }, (_, i) => i)
      const json = JSON.stringify(array)
      const result = parseJson(json)
      expect(result).toEqual(array)
    })

    it('should handle JSON with null values', () => {
      const result = parseJson('{"key":null}')
      // oxlint-disable-next-line socket/prefer-undefined-over-null
      expect(result).toEqual({ key: null })
    })

    it('should handle mixed types in array', () => {
      const result = parseJson('[null,true,42,"string",{"key":"value"},[1,2]]')
      expect(result).toEqual([
        // oxlint-disable-next-line socket/prefer-undefined-over-null
        null,
        true,
        42,
        'string',
        { key: 'value' },
        [1, 2],
      ])
    })

    it('should handle zero', () => {
      expect(parseJson('0')).toBe(0)
      expect(parseJson('-0')).toBe(-0)
    })

    it('should handle empty string value', () => {
      const result = parseJson('{"empty":""}')
      expect(result).toEqual({ empty: '' })
    })
  })

  describe('error message formatting', () => {
    it('should preserve original error type', () => {
      try {
        parseJson('invalid')
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(SyntaxError)
      }
    })

    it('should preserve original error for Buffer', () => {
      const buffer = Buffer.from('invalid', 'utf8')
      try {
        parseJson(buffer)
        expect.fail('Should have thrown')
      } catch (e) {
        expect(e).toBeInstanceOf(SyntaxError)
      }
    })

    it('should handle filepath with special characters', () => {
      try {
        parseJson('invalid', { filepath: '/path/with spaces/file.json' })
        expect.fail('Should have thrown')
      } catch (e) {
        expect((e as Error).message).toContain('/path/with spaces/file.json')
      }
    })

    it('should handle very long filepath', () => {
      const longPath = `/very/long/path/${'a'.repeat(1000)}/file.json`
      try {
        parseJson('invalid', { filepath: longPath })
        expect.fail('Should have thrown')
      } catch (e) {
        expect((e as Error).message).toContain(longPath)
      }
    })

    it('should not modify error when filepath is undefined', () => {
      try {
        parseJson('invalid', { filepath: undefined })
        expect.fail('Should have thrown')
      } catch (e) {
        expect((e as Error).message).not.toContain('undefined')
      }
    })
  })

  describe('isBuffer internal function edge cases', () => {
    it('should handle falsy values that are not Buffers', () => {
      // Tests line 156: if (!x || typeof x !== 'object')
      expect(parseJson('null')).toBe(null)
      expect(parseJson('false')).toBe(false)
      expect(parseJson('0')).toBe(0)
    })

    it('should handle objects without length property', () => {
      // Tests line 160-161: typeof obj['length'] !== 'number'
      // parseJson with an object that looks nothing like a Buffer should fail gracefully
      expect(() => {
        // @ts-expect-error - testing runtime behavior with invalid input
        parseJson({ some: 'object' })
      }).toThrow()
    })

    it('should handle objects with non-number length', () => {
      // Tests line 160-161: typeof obj['length'] !== 'number'
      expect(() => {
        // @ts-expect-error - testing runtime behavior
        parseJson({ length: 'not a number' })
      }).toThrow()
    })

    it('should handle objects missing copy/slice methods', () => {
      // Tests line 163-164: missing copy or slice methods
      expect(() => {
        // @ts-expect-error - testing runtime behavior
        parseJson({ length: 10 })
      }).toThrow()

      expect(() => {
        // @ts-expect-error - testing runtime behavior
        parseJson({ length: 10, copy: 'not a function' })
      }).toThrow()

      expect(() => {
        // @ts-expect-error - testing runtime behavior
        parseJson({ length: 10, slice: 'not a function' })
      }).toThrow()
    })

    it('should handle array-like objects with non-number first element', () => {
      // Tests line 166-171: length > 0 but obj[0] is not a number
      expect(() => {
        parseJson({
          length: 1,
          0: 'not a number',
          // @ts-expect-error - Testing Buffer-like object with invalid method signatures
          copy: () => {},
          // @ts-expect-error - Testing Buffer-like object with invalid method signatures
          slice: () => {},
        })
      }).toThrow()
    })

    it('should handle objects without proper constructor', () => {
      // Tests line 174-177: constructor.isBuffer checks
      expect(() => {
        parseJson({
          length: 0,
          // @ts-expect-error - Testing Buffer-like object with invalid method signatures
          copy: () => {},
          // @ts-expect-error - Testing Buffer-like object with invalid method signatures
          slice: () => {},
          // @ts-expect-error - Testing Buffer-like object with missing isBuffer method
          constructor: {}, // No isBuffer method
        })
      }).toThrow()

      expect(() => {
        parseJson({
          length: 0,
          // @ts-expect-error - Testing Buffer-like object with invalid method signatures
          copy: () => {},
          // @ts-expect-error - Testing Buffer-like object with invalid method signatures
          slice: () => {},
          constructor: {
            // @ts-expect-error - Testing Buffer-like object with non-function isBuffer
            isBuffer: 'not a function',
          },
        })
      }).toThrow()
    })
  })
})
