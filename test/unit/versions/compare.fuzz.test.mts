import fc from 'fast-check'
import { describe, expect, test } from 'vitest'

import {
  compare,
  eq,
  gt,
  gte,
  lt,
  lte,
  neq,
  rsort,
  sort,
} from '../../../src/versions/compare'

// Build valid semver strings by JOINING generated numeric parts (never by
// generating a random string then reimplementing compare). Numeric prerelease
// identifiers come from String(nat) so they never carry leading zeros (which
// semver would reject).
const numPart = fc.nat({ max: 500 })

const preIdent = fc.oneof(
  fc.nat({ max: 500 }).map(String),
  fc.constantFrom('alpha', 'beta', 'rc', 'pre', 'x'),
)

const preRelease = fc
  .array(preIdent, { minLength: 1, maxLength: 3 })
  .map(ids => ids.join('.'))

// A numeric (major, minor, patch) triple — the release core.
const coreTriple = fc.tuple(numPart, numPart, numPart)

// A valid version string, optionally with a prerelease tag.
const versionArb = fc
  .tuple(coreTriple, fc.option(preRelease, { nil: undefined }))
  .map(([[ma, mi, pa], pre]) =>
    pre === undefined ? `${ma}.${mi}.${pa}` : `${ma}.${mi}.${pa}-${pre}`,
  )

// sign helper for antisymmetry checks.
function sign(n: number): -1 | 0 | 1 {
  return n > 0 ? 1 : n < 0 ? -1 : 0
}

describe('versions/compare — fuzz', () => {
  // INVARIANT: reflexivity — a version always equals itself.
  test('reflexivity: compare(a, a) === 0 and eq/lte/gte agree', () => {
    fc.assert(
      fc.property(versionArb, a => {
        expect(compare(a, a)).toBe(0)
        expect(eq(a, a)).toBe(true)
        expect(neq(a, a)).toBe(false)
        expect(lte(a, a)).toBe(true)
        expect(gte(a, a)).toBe(true)
        expect(lt(a, a)).toBe(false)
        expect(gt(a, a)).toBe(false)
      }),
    )
  })

  // INVARIANT: antisymmetry — swapping arguments negates the ordering.
  test('antisymmetry: sign(compare(a, b)) === -sign(compare(b, a))', () => {
    fc.assert(
      fc.property(versionArb, versionArb, (a, b) => {
        const ab = compare(a, b)
        const ba = compare(b, a)
        expect(ab).not.toBeUndefined()
        expect(ba).not.toBeUndefined()
        expect(sign(ab as number)).toBe(-sign(ba as number))
      }),
    )
  })

  // INVARIANT: transitivity of the total order.
  test('transitivity: a<=b and b<=c implies a<=c', () => {
    fc.assert(
      fc.property(versionArb, versionArb, versionArb, (a, b, c) => {
        const ab = compare(a, b) as number
        const bc = compare(b, c) as number
        const ac = compare(a, c) as number
        if (ab <= 0 && bc <= 0) {
          expect(ac).toBeLessThanOrEqual(0)
        }
        if (ab >= 0 && bc >= 0) {
          expect(ac).toBeGreaterThanOrEqual(0)
        }
      }),
    )
  })

  // ORACLE (consistency): the boolean ops must agree with compare's sign for
  // valid inputs.
  test('boolean ops are consistent with compare()', () => {
    fc.assert(
      fc.property(versionArb, versionArb, (a, b) => {
        const c = compare(a, b) as number
        expect(eq(a, b)).toBe(c === 0)
        expect(neq(a, b)).toBe(c !== 0)
        expect(lt(a, b)).toBe(c < 0)
        expect(gt(a, b)).toBe(c > 0)
        expect(lte(a, b)).toBe(c <= 0)
        expect(gte(a, b)).toBe(c >= 0)
      }),
    )
  })

  // ORACLE (derived-from-input): for release-only versions the order is exactly
  // the lexicographic order of the numeric (major, minor, patch) triple. This
  // oracle is a trivial tuple compare, not a reimplementation of the SUT.
  test('release-only order matches numeric triple order', () => {
    fc.assert(
      fc.property(coreTriple, coreTriple, (ta, tb) => {
        const a = ta.join('.')
        const b = tb.join('.')
        let expected: -1 | 0 | 1 = 0
        for (let i = 0; i < 3; i += 1) {
          if (ta[i]! < tb[i]!) {
            expected = -1
            break
          }
          if (ta[i]! > tb[i]!) {
            expected = 1
            break
          }
        }
        expect(compare(a, b)).toBe(expected)
      }),
    )
  })

  // RESTRICTED-INPUT: a prerelease of X is strictly less than the release X.
  test('prerelease is strictly less than its release core', () => {
    fc.assert(
      fc.property(coreTriple, preRelease, ([ma, mi, pa], pre) => {
        const release = `${ma}.${mi}.${pa}`
        const withPre = `${release}-${pre}`
        expect(compare(withPre, release)).toBe(-1)
        expect(lt(withPre, release)).toBe(true)
        expect(gt(withPre, release)).toBe(false)
        expect(eq(withPre, release)).toBe(false)
      }),
    )
  })

  // NEVER-THROWS (parser robustness): compare() swallows invalid input into
  // undefined and always returns a value in {-1, 0, 1, undefined}.
  test('compare() never throws and stays in {-1,0,1,undefined}', () => {
    fc.assert(
      fc.property(fc.string(), fc.string(), (a, b) => {
        const result = compare(a, b)
        expect([-1, 0, 1, undefined]).toContain(result)
      }),
    )
  })

  // ROUND-TRIP + INVARIANT: sort yields an ascending permutation, and rsort is
  // exactly its reverse.
  test('sort() is an ascending permutation and rsort() is its reverse', () => {
    fc.assert(
      fc.property(fc.array(versionArb, { maxLength: 12 }), versions => {
        const asc = sort(versions)
        const desc = rsort(versions)
        // Permutation: same multiset of strings as the input.
        expect([...asc].toSorted()).toEqual([...versions].toSorted())
        // Ascending: each adjacent pair is non-decreasing.
        for (let i = 1; i < asc.length; i += 1) {
          expect(compare(asc[i - 1]!, asc[i]!)).not.toBe(1)
        }
        // rsort is the reverse ordering of sort.
        expect(desc).toEqual([...asc].toReversed())
      }),
    )
  })
})
