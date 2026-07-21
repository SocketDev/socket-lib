import fc from 'fast-check'
import { describe, expect, test } from 'vitest'

import {
  filterVersions,
  maxVersion,
  minVersion,
  satisfiesVersion,
} from '../../../src/versions/range'

// A valid, non-prerelease semver string built from generated parts. Kept in a
// bounded numeric range so we never generate values that overflow semver's
// numeric-identifier limit.
const versionArb = fc
  .tuple(
    fc.nat({ max: 100_000 }),
    fc.nat({ max: 100_000 }),
    fc.nat({ max: 100_000 }),
  )
  .map(([major, minor, patch]) => `${major}.${minor}.${patch}`)

// Arbitrary junk that may or may not be a valid version — used to prove the
// parsers never throw on hostile input.
const junkArb = fc.oneof(versionArb, fc.string())

describe('versions/range — fuzz', () => {
  // Invariant + never-throws: satisfiesVersion is total over arbitrary strings
  // and always yields a boolean.
  test('satisfiesVersion never throws and returns a boolean', () => {
    fc.assert(
      fc.property(junkArb, junkArb, (version, range) => {
        const result = satisfiesVersion(version, range)
        expect(typeof result).toBe('boolean')
      }),
    )
  })

  // Restricted-input: an exact range accepts its own version.
  test('an exact range accepts its own base version', () => {
    fc.assert(
      fc.property(versionArb, version => {
        expect(satisfiesVersion(version, version)).toBe(true)
      }),
    )
  })

  // Restricted-input: a caret range accepts its own base version.
  test('a caret range accepts its own base version', () => {
    fc.assert(
      fc.property(versionArb, version => {
        expect(satisfiesVersion(version, `^${version}`)).toBe(true)
      }),
    )
  })

  // Restricted-input: a tilde range accepts its own base version.
  test('a tilde range accepts its own base version', () => {
    fc.assert(
      fc.property(versionArb, version => {
        expect(satisfiesVersion(version, `~${version}`)).toBe(true)
      }),
    )
  })

  // Oracle: filterVersions must agree, element-for-element, with a manual
  // filter over satisfiesVersion (the two exported surfaces are consistent).
  test('filterVersions is consistent with satisfiesVersion', () => {
    fc.assert(
      fc.property(fc.array(junkArb), junkArb, (versions, range) => {
        const expected = versions.filter(v => satisfiesVersion(v, range))
        expect(filterVersions(versions, range)).toEqual(expected)
      }),
    )
  })

  // Derived-from-input + never-throws: the result is always an order-preserving
  // subset of the input, never a superset, even for hostile input.
  test('filterVersions returns an order-preserving subset', () => {
    fc.assert(
      fc.property(fc.array(junkArb), junkArb, (versions, range) => {
        const filtered = filterVersions(versions, range)
        expect(filtered.length).toBeLessThanOrEqual(versions.length)
        // Subsequence check: filtered order matches original order.
        let cursor = 0
        for (const v of filtered) {
          const found = versions.indexOf(v, cursor)
          expect(found).toBeGreaterThanOrEqual(0)
          cursor = found + 1
        }
      }),
    )
  })

  // Invariant: every valid version satisfies the all-inclusive lower bound, so
  // filtering by '>=0.0.0' returns the input unchanged.
  test("filterVersions with '>=0.0.0' keeps every valid version", () => {
    fc.assert(
      fc.property(fc.array(versionArb), versions => {
        expect(filterVersions(versions, '>=0.0.0')).toEqual(versions)
      }),
    )
  })

  // Oracle: with distinct majors the max/min are known by construction, no
  // reimplementation of semver ordering required.
  test('maxVersion / minVersion pick the extreme major', () => {
    fc.assert(
      fc.property(
        fc.uniqueArray(fc.nat({ max: 100_000 }), { minLength: 1 }),
        majors => {
          const versions = majors.map(m => `${m}.0.0`)
          const highest = `${Math.max(...majors)}.0.0`
          const lowest = `${Math.min(...majors)}.0.0`
          expect(maxVersion(versions)).toBe(highest)
          expect(minVersion(versions)).toBe(lowest)
        },
      ),
    )
  })

  // Restricted-input: a single-element array collapses max === min === element.
  test('maxVersion and minVersion agree on a single-element array', () => {
    fc.assert(
      fc.property(versionArb, version => {
        expect(maxVersion([version])).toBe(version)
        expect(minVersion([version])).toBe(version)
      }),
    )
  })

  // Derived-from-input + never-throws: for arbitrary input the bound pickers
  // either return undefined or an element drawn from the input.
  test('maxVersion / minVersion return an input element or undefined', () => {
    fc.assert(
      fc.property(fc.array(junkArb), versions => {
        for (const pick of [maxVersion(versions), minVersion(versions)]) {
          if (pick !== undefined) {
            expect(versions).toContain(pick)
          }
        }
      }),
    )
  })
})
