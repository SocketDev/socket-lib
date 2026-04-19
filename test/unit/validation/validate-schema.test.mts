/**
 * @fileoverview Unit tests for the universal schema validator.
 *
 * Covers both supported schema kinds through the single API:
 * - Zod (v4 via the installed `zod` devDep)
 * - TypeBox (`@sinclair/typebox`)
 *
 * Also covers error normalization, the throwing `parseSchema` twin, and
 * type-flow assertions via `expectTypeOf`.
 */

import { Type, type Static } from '@sinclair/typebox'
import { describe, expect, expectTypeOf, it } from 'vitest'
import { z } from 'zod'

import {
  parseSchema,
  validateSchema,
} from '@socketsecurity/lib/validation/validate-schema'

describe('validation/validate-schema', () => {
  describe('Zod schemas', () => {
    const UserZ = z.object({
      name: z.string(),
      age: z.number(),
    })

    it('returns ok:true with typed value on valid input', () => {
      const result = validateSchema(UserZ, { name: 'Alice', age: 30 })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual({ name: 'Alice', age: 30 })
        expectTypeOf(result.value).toEqualTypeOf<z.infer<typeof UserZ>>()
      }
    })

    it('returns ok:false with normalized issues on invalid input', () => {
      const result = validateSchema(UserZ, { name: 'Alice', age: 'thirty' })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(Array.isArray(result.errors)).toBe(true)
        expect(result.errors.length).toBeGreaterThan(0)
        const ageIssue = result.errors.find(
          (e: { path: Array<string | number> }) =>
            e.path.some((p: string | number) => p === 'age'),
        )
        expect(ageIssue).toBeDefined()
        expect(typeof ageIssue!.message).toBe('string')
      }
    })

    it('rejects fully wrong shape', () => {
      const result = validateSchema(UserZ, 'not-an-object')
      expect(result.ok).toBe(false)
    })
  })

  describe('TypeBox schemas', () => {
    const UserT = Type.Object({
      name: Type.String(),
      age: Type.Number(),
    })

    it('returns ok:true with typed value on valid input', () => {
      const result = validateSchema(UserT, { name: 'Bob', age: 42 })
      expect(result.ok).toBe(true)
      if (result.ok) {
        expect(result.value).toEqual({ name: 'Bob', age: 42 })
        expectTypeOf(result.value).toEqualTypeOf<Static<typeof UserT>>()
      }
    })

    it('returns ok:false with normalized issues on invalid input', () => {
      const result = validateSchema(UserT, { name: 'Bob', age: 'forty-two' })
      expect(result.ok).toBe(false)
      if (!result.ok) {
        expect(Array.isArray(result.errors)).toBe(true)
        expect(result.errors.length).toBeGreaterThan(0)
        // TypeBox path: '/age' becomes ['age'].
        const ageIssue = result.errors.find(
          (e: { path: Array<string | number> }) =>
            e.path.some((p: string | number) => p === 'age'),
        )
        expect(ageIssue).toBeDefined()
      }
    })

    it('converts numeric JSON-Pointer segments to numbers', () => {
      const ArrayT = Type.Array(Type.String())
      const result = validateSchema(ArrayT, ['a', 42, 'c'])
      expect(result.ok).toBe(false)
      if (!result.ok) {
        // '/1' should map to [1] (number), not ['1'] (string).
        const issue = result.errors.find(
          (e: { path: Array<string | number> }) => e.path.includes(1),
        )
        expect(issue).toBeDefined()
      }
    })
  })

  describe('parseSchema (throwing)', () => {
    it('returns the value on success (TypeBox)', () => {
      const UserT = Type.Object({ name: Type.String() })
      const value = parseSchema(UserT, { name: 'Carol' })
      expect(value).toEqual({ name: 'Carol' })
      expectTypeOf(value).toEqualTypeOf<Static<typeof UserT>>()
    })

    it('returns the value on success (Zod)', () => {
      const UserZ = z.object({ name: z.string() })
      const value = parseSchema(UserZ, { name: 'Dave' })
      expect(value).toEqual({ name: 'Dave' })
      expectTypeOf(value).toEqualTypeOf<z.infer<typeof UserZ>>()
    })

    it('throws on validation failure (TypeBox)', () => {
      const UserT = Type.Object({ name: Type.String() })
      expect(() => parseSchema(UserT, { name: 42 })).toThrow(
        /Validation failed/,
      )
    })

    it('throws on validation failure (Zod)', () => {
      const UserZ = z.object({ name: z.string() })
      expect(() => parseSchema(UserZ, { name: 42 })).toThrow(
        /Validation failed/,
      )
    })
  })

  describe('unsupported schema kinds', () => {
    it('throws on null', () => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      expect(() => validateSchema(null as any, {})).toThrow(
        /unsupported schema kind/,
      )
    })

    it('throws on plain object without safeParse or Kind symbol', () => {
      expect(() => validateSchema({ foo: 'bar' }, {})).toThrow(
        /unsupported schema kind/,
      )
    })
  })
})
