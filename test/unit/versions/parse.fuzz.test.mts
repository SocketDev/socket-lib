/**
 * @file Property/fuzz tests (fast-check, Tier 1 — pure in-process SUT calls, no
 *   IO) for `versions/parse`. Version parsers must be TOTAL: `coerceVersion`,
 *   `parseVersion`, `getMajor/Minor/PatchVersion` and `isValidVersion` return
 *   `undefined`/`false` on garbage rather than throwing. fast-check hammers
 *   each with arbitrary strings for the never-throws invariant, then CONSTRUCTS
 *   known-valid triples for the round-trip and idempotence properties (the
 *   SUT's output is not re-implemented — only characteristics are asserted).
 */

import fc from 'fast-check'
import { describe, expect, test } from 'vitest'

import {
  coerceVersion,
  getMajorVersion,
  getMinorVersion,
  getPatchVersion,
  isValidVersion,
  parseVersion,
} from '../../../src/versions/parse'

// Semver components must stay within the safe-integer / 16-digit-length window
// semver enforces. 2**31 - 1 is 10 digits — comfortably inside it and large
// enough to exercise multi-digit handling.
const componentArb = fc.nat({ max: 2 ** 31 - 1 })

describe('versions/parse — never throws (invariant)', () => {
  test('coerceVersion tolerates any string', () => {
    fc.assert(
      fc.property(fc.string(), s => {
        expect(() => coerceVersion(s)).not.toThrow()
      }),
    )
  })

  test('parseVersion / accessors / isValidVersion tolerate any string', () => {
    fc.assert(
      fc.property(fc.string(), s => {
        expect(() => parseVersion(s)).not.toThrow()
        expect(() => getMajorVersion(s)).not.toThrow()
        expect(() => getMinorVersion(s)).not.toThrow()
        expect(() => getPatchVersion(s)).not.toThrow()
        expect(() => isValidVersion(s)).not.toThrow()
      }),
    )
  })

  test('never-null-or-throw returns are typed correctly on garbage', () => {
    // Prefix with a letter so the string is overwhelmingly NOT a valid version;
    // the point is that the invalid branch stays well-typed, not that it throws.
    fc.assert(
      fc.property(fc.string(), s => {
        const garbage = `x${s}`
        const parsed = parseVersion(garbage)
        expect(parsed === undefined || typeof parsed === 'object').toBe(true)
        const major = getMajorVersion(garbage)
        expect(major === undefined || typeof major === 'number').toBe(true)
        expect(typeof isValidVersion(garbage)).toBe('boolean')
      }),
    )
  })
})

describe('versions/parse — round-trip (constructed-valid triple)', () => {
  test('parseVersion recovers the exact major/minor/patch triple', () => {
    fc.assert(
      fc.property(componentArb, componentArb, componentArb, (mj, mn, pt) => {
        const version = `${mj}.${mn}.${pt}`
        const parsed = parseVersion(version)
        expect(parsed).toBeDefined()
        expect(parsed?.major).toBe(mj)
        expect(parsed?.minor).toBe(mn)
        expect(parsed?.patch).toBe(pt)
        // A plain triple has no prerelease / build metadata.
        expect(parsed?.prerelease).toEqual([])
        expect(parsed?.build).toEqual([])
      }),
    )
  })

  test('component accessors agree with the constructed triple', () => {
    fc.assert(
      fc.property(componentArb, componentArb, componentArb, (mj, mn, pt) => {
        const version = `${mj}.${mn}.${pt}`
        expect(getMajorVersion(version)).toBe(mj)
        expect(getMinorVersion(version)).toBe(mn)
        expect(getPatchVersion(version)).toBe(pt)
        expect(isValidVersion(version)).toBe(true)
      }),
    )
  })

  test('a constructed prerelease identifier round-trips as a string element', () => {
    // Identifiers that begin with a letter stay strings (numeric-only ids are
    // coerced to numbers by semver) — so we can predict the element WITHOUT
    // re-implementing the parser.
    const identArb = fc
      .tuple(
        fc.constantFrom(...'abcdefghijklmnopqrstuvwxyz'.split('')),
        fc.stringMatching(/^[a-z0-9]*$/),
      )
      .map(([head, tail]) => `${head}${tail}`)
    fc.assert(
      fc.property(componentArb, identArb, (mj, ident) => {
        const version = `${mj}.0.0-${ident}`
        const parsed = parseVersion(version)
        expect(parsed).toBeDefined()
        expect(parsed?.major).toBe(mj)
        expect(parsed?.prerelease).toContain(ident)
      }),
    )
  })
})

describe('versions/parse — coerceVersion (derived + idempotence + oracle)', () => {
  test('a canonical triple coerces to itself', () => {
    fc.assert(
      fc.property(componentArb, componentArb, componentArb, (mj, mn, pt) => {
        const version = `${mj}.${mn}.${pt}`
        expect(coerceVersion(version)).toBe(version)
      }),
    )
  })

  test('any defined coercion is itself valid and is a fixed point', () => {
    fc.assert(
      fc.property(fc.string(), s => {
        const coerced = coerceVersion(s)
        if (coerced !== undefined) {
          // Output of coercion is always a valid version...
          expect(isValidVersion(coerced)).toBe(true)
          // ...and re-coercing a canonical version is a no-op (idempotent).
          expect(coerceVersion(coerced)).toBe(coerced)
        }
      }),
    )
  })
})

describe('versions/parse — accessor/parseVersion consistency (oracle)', () => {
  test('accessors mirror parseVersion fields on arbitrary input', () => {
    fc.assert(
      fc.property(fc.string(), s => {
        const parsed = parseVersion(s)
        if (parsed === undefined) {
          // parseVersion says invalid; the accessors must all agree.
          expect(getMajorVersion(s)).toBeUndefined()
          expect(getMinorVersion(s)).toBeUndefined()
          expect(getPatchVersion(s)).toBeUndefined()
        } else {
          expect(getMajorVersion(s)).toBe(parsed.major)
          expect(getMinorVersion(s)).toBe(parsed.minor)
          expect(getPatchVersion(s)).toBe(parsed.patch)
        }
      }),
    )
  })
})
