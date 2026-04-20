/**
 * @fileoverview Unit tests for `validateSchema` — the non-throwing universal
 * validator exported from `@socketsecurity/lib/schema/validate`.
 *
 * Exercises all three supported schema kinds:
 * - Zod v3 (via `zod@3`)
 * - Zod v4 (via `zod@4`)
 * - TypeBox (via the bundled `src/external/@sinclair/typebox` runtime)
 *
 * Plus error normalization (Zod issue shape + TypeBox ValueError path
 * conversion) and the unsupported-schema TypeError branch.
 */

import * as zodV3 from 'zod/v3'
import * as zodV4 from 'zod/v4'
import { describe, expect, it } from 'vitest'

import { validateSchema } from '@socketsecurity/lib/schema/validate'

// TypeBox is bundled under src/external/. Tests run against the
// compiled dist externals path.
import { Type } from '../../../src/external/@sinclair/typebox'

describe('schema/validate', () => {
  describe('Zod v3', () => {
    it('returns ok with typed value for valid input', () => {
      const User = zodV3.object({ name: zodV3.string(), age: zodV3.number() })
      const result = validateSchema(User, { name: 'Alice', age: 30 })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual({ name: 'Alice', age: 30 })
      }
    })

    it('returns normalized errors for invalid input', () => {
      const User = zodV3.object({ name: zodV3.string(), age: zodV3.number() })
      const result = validateSchema(User, { name: 123, age: 'oops' })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThanOrEqual(2)
        for (const issue of result.errors) {
          expect(Array.isArray(issue.path)).toBe(true)
          expect(typeof issue.message).toBe('string')
        }
        // Path should carry the field name.
        const paths = result.errors.map(e => e.path.join('.'))
        expect(paths).toContain('name')
        expect(paths).toContain('age')
      }
    })

    it('normalizes nested path segments', () => {
      const Wrap = zodV3.object({
        user: zodV3.object({ age: zodV3.number() }),
      })
      const result = validateSchema(Wrap, { user: { age: 'bad' } })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors[0]!.path).toEqual(['user', 'age'])
      }
    })
  })

  describe('Zod v4', () => {
    it('returns ok with typed value for valid input', () => {
      const User = zodV4.object({ name: zodV4.string() })
      const result = validateSchema(User, { name: 'Bob' })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual({ name: 'Bob' })
      }
    })

    it('returns normalized errors for invalid input', () => {
      const User = zodV4.object({ name: zodV4.string() })
      const result = validateSchema(User, { name: 42 })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThanOrEqual(1)
        expect(result.errors[0]!.path).toEqual(['name'])
        expect(typeof result.errors[0]!.message).toBe('string')
      }
    })
  })

  describe('TypeBox', () => {
    it('returns ok for valid input against a TypeBox schema', () => {
      const S = Type.Object({ name: Type.String(), age: Type.Number() })
      const result = validateSchema(S, { name: 'Carol', age: 25 })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual({ name: 'Carol', age: 25 })
      }
    })

    it('returns normalized errors for invalid input', () => {
      const S = Type.Object({ age: Type.Number() })
      const result = validateSchema(S, { age: 'not-a-number' })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors.length).toBeGreaterThanOrEqual(1)
        for (const issue of result.errors) {
          expect(Array.isArray(issue.path)).toBe(true)
          expect(typeof issue.message).toBe('string')
        }
      }
    })

    it('converts JSON-Pointer paths (/user/0/name) to segment arrays', () => {
      // TypeBox surfaces paths as JSON Pointers; validateSchema normalizes
      // them to arrays with numeric indices where applicable.
      const S = Type.Object({
        users: Type.Array(Type.Object({ name: Type.String() })),
      })
      const result = validateSchema(S, { users: [{ name: 42 }] })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        // Path should include a numeric array index somewhere.
        const hasNumericIndex = result.errors.some(e =>
          e.path.some(seg => typeof seg === 'number'),
        )
        expect(hasNumericIndex).toBe(true)
      }
    })
  })

  describe('duck-typed .safeParse', () => {
    it('accepts any object with .safeParse that returns success', () => {
      const fakeSchema = {
        safeParse: (data: unknown) => ({ success: true as const, data }),
      }
      const result = validateSchema(fakeSchema, { foo: 'bar' })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual({ foo: 'bar' })
      }
    })

    it('accepts any object with .safeParse that returns failure', () => {
      const fakeSchema = {
        safeParse: () => ({
          success: false as const,
          error: {
            issues: [{ path: ['field'], message: 'nope' }],
          },
        }),
      }
      const result = validateSchema(fakeSchema, 'anything')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors).toEqual([{ path: ['field'], message: 'nope' }])
      }
    })

    it('falls back to a single synthetic issue when error.issues is missing', () => {
      const fakeSchema = {
        safeParse: () => ({
          success: false as const,
          error: { notIssues: true },
        }),
      }
      const result = validateSchema(fakeSchema, 'x')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors).toHaveLength(1)
        expect(result.errors[0]!.path).toEqual([])
        expect(typeof result.errors[0]!.message).toBe('string')
      }
    })

    it('handles non-object error values by stringifying', () => {
      const fakeSchema = {
        safeParse: () => ({ success: false as const, error: 'flat-error' }),
      }
      const result = validateSchema(fakeSchema, 'x')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors[0]!.message).toContain('flat-error')
      }
    })

    it('coerces a non-array issue.path to []', () => {
      const fakeSchema = {
        safeParse: () => ({
          success: false as const,
          error: {
            issues: [{ path: 'not-array', message: 'bad' }],
          },
        }),
      }
      const result = validateSchema(fakeSchema, 'x')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors[0]!.path).toEqual([])
        expect(result.errors[0]!.message).toBe('bad')
      }
    })

    it('coerces a non-string issue.message to a default', () => {
      const fakeSchema = {
        safeParse: () => ({
          success: false as const,
          error: {
            issues: [{ path: [], message: 123 }],
          },
        }),
      }
      const result = validateSchema(fakeSchema, 'x')
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(result.errors[0]!.message).toBe('Invalid value')
      }
    })
  })

  describe('unsupported schema kind', () => {
    it('throws TypeError for null', () => {
      expect(() => validateSchema(null, 'x')).toThrow(TypeError)
    })

    it('throws TypeError for a plain object without safeParse', () => {
      expect(() => validateSchema({ notASchema: true }, 'x')).toThrow(TypeError)
    })

    it('throws TypeError for primitive inputs', () => {
      expect(() => validateSchema(42, 'x')).toThrow(TypeError)
      expect(() => validateSchema('string', 'x')).toThrow(TypeError)
    })
  })
})
