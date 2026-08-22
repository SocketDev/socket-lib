/*
 * @file Unit tests for the change-array-by-copy shims.
 *
 *   Only observable behavior is asserted: what the result contains, whether the
 *   input moved, where undefined lands, and what a bad comparator throws. The
 *   spec's internal SortIndexedProperties is not modeled and is not checked.
 */

import { describe, expect, it } from 'vitest'

import {
  arrayToReversed,
  arrayToReversedNative,
  arrayToReversedShim,
  arrayToSorted,
  arrayToSortedNative,
  arrayToSortedShim,
  toLength,
} from '../../../src/polyfills/array.mjs'

describe('toLength', () => {
  it('clamps a negative or non-numeric length to zero', () => {
    // Without this, `new Array(-1)` throws a RangeError where the spec
    // produces an empty array.
    expect(toLength(-1)).toBe(0)
    expect(toLength(Number.NaN)).toBe(0)
    expect(toLength(undefined)).toBe(0)
    expect(toLength(-0)).toBe(0)
  })

  it('truncates toward zero', () => {
    expect(toLength(3.7)).toBe(3)
  })

  it('coerces a numeric string', () => {
    expect(toLength('2')).toBe(2)
  })

  it('caps at the maximum safe length', () => {
    expect(toLength(Number.POSITIVE_INFINITY)).toBe(2 ** 53 - 1)
  })
})

describe('arrayToReversed', () => {
  for (const [label, toReversed] of [
    ['shim', arrayToReversedShim],
    ['selected', arrayToReversed],
  ] as const) {
    describe(label, () => {
      it('returns the elements in reverse order', () => {
        expect(toReversed([1, 2, 3])).toEqual([3, 2, 1])
      })

      it('leaves the input untouched', () => {
        const input = [1, 2, 3]
        toReversed(input)
        expect(input).toEqual([1, 2, 3])
      })

      it('returns a new array rather than the input', () => {
        const input = [1]
        const sameArray = toReversed(input) === input
        expect(sameArray).toBe(false)
      })

      it('an empty array reverses to an empty array', () => {
        expect(toReversed([])).toEqual([])
      })

      it('a single element reverses to itself', () => {
        expect(toReversed(['only'])).toEqual(['only'])
      })

      it('fills holes with undefined, so the result is dense', () => {
        // Built by index so there is no sparse array literal: index 1 is a hole.
        const sparse: number[] = []
        sparse[0] = 1
        sparse[2] = 3
        const out = toReversed(sparse)
        const hasIndexOne = 1 in out
        expect(hasIndexOne).toBe(true)
        expect(out).toEqual([3, undefined, 1])
      })
    })
  }

  it('prefers the native method when the engine has one', () => {
    const picked = arrayToReversedNative ?? arrayToReversedShim
    const selectedIsPicked = arrayToReversed === picked
    expect(selectedIsPicked).toBe(true)
  })
})

describe('arrayToSorted', () => {
  for (const [label, toSorted] of [
    ['shim', arrayToSortedShim],
    ['selected', arrayToSorted],
  ] as const) {
    describe(label, () => {
      it('sorts with the given comparator', () => {
        expect(arrayToSortedNumbers(toSorted)).toEqual([1, 2, 3, 10])
      })

      it('sorts lexicographically when no comparator is given', () => {
        // The default is string comparison, which is why 10 lands before 2.
        expect(toSorted([10, 2, 1])).toEqual([1, 10, 2])
      })

      it('leaves the input untouched', () => {
        const input = [3, 1, 2]
        toSorted(input, (a, b) => a - b)
        expect(input).toEqual([3, 1, 2])
      })

      it('returns a new array rather than the input', () => {
        const input = [1]
        const sameArray = toSorted(input) === input
        expect(sameArray).toBe(false)
      })

      it('places undefined last whatever the comparator says', () => {
        // The comparator is never called for undefined, so a comparator that
        // would sort it first cannot.
        const out = toSorted(
          [3, undefined, 1] as Array<number | undefined>,
          () => -1,
        )
        expect(out[2]).toBe(undefined)
      })

      it('is stable for equal-ranked elements', () => {
        const input = [
          { k: 'a', n: 1 },
          { k: 'b', n: 1 },
          { k: 'c', n: 1 },
        ]
        const out = toSorted(input, (x, y) => x.n - y.n)
        expect(out.map(entry => entry.k)).toEqual(['a', 'b', 'c'])
      })

      it('an empty array sorts to an empty array', () => {
        expect(toSorted([])).toEqual([])
      })

      it('fills holes with undefined, so the result is dense', () => {
        // Built by index so there is no sparse array literal: index 1 is a hole.
        const sparse: number[] = []
        sparse[0] = 3
        sparse[2] = 1
        const out = toSorted(sparse)
        const hasIndexTwo = 2 in out
        expect(hasIndexTwo).toBe(true)
        expect(out).toEqual([1, 3, undefined])
      })

      it('throws a TypeError when the comparator is not callable', () => {
        expect(() => toSorted([2, 1], 'not a function' as never)).toThrow(
          TypeError,
        )
      })

      it('validates the comparator before reading any element', () => {
        // An empty array still throws, so the check cannot be inside the loop.
        expect(() => toSorted([], 42 as never)).toThrow(TypeError)
      })

      it('accepts an explicit undefined comparator', () => {
        expect(toSorted([2, 1], undefined)).toEqual([1, 2])
      })
    })
  }

  it('prefers the native method when the engine has one', () => {
    const picked = arrayToSortedNative ?? arrayToSortedShim
    const selectedIsPicked = arrayToSorted === picked
    expect(selectedIsPicked).toBe(true)
  })
})

/**
 * Sorts a fixed numeric fixture, kept out of the `it` body so the call fits one
 * line beside its assertion.
 */
function arrayToSortedNumbers(
  toSorted: (
    arr: readonly number[],
    comparator?: ((a: number, b: number) => number) | undefined,
  ) => number[],
): number[] {
  return toSorted([3, 1, 10, 2], (a, b) => a - b)
}
