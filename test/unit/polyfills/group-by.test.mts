/*
 * @file Unit tests for the groupBy shims.
 *
 *   Both branches are driven explicitly, and the two algorithms are compared
 *   where they legitimately DIFFER: key coercion. Asserting only the shared
 *   behavior would let one be swapped for the other without a failure.
 */

import { describe, expect, it } from 'vitest'

import {
  mapGroupBy,
  mapGroupByNative,
  mapGroupByShim,
  objectGroupBy,
  objectGroupByNative,
  objectGroupByShim,
} from '../../../src/polyfills/group-by.mjs'

describe('objectGroupBy', () => {
  for (const [label, groupBy] of [
    ['shim', objectGroupByShim],
    ['selected', objectGroupBy],
  ] as const) {
    describe(label, () => {
      it('groups by the returned key', () => {
        const out = groupBy([1, 2, 3, 4], n => (n % 2 === 0 ? 'even' : 'odd'))
        expect(out).toEqual({ even: [2, 4], odd: [1, 3] })
      })

      it('passes the index as the second argument', () => {
        const seen: number[] = []
        groupBy(['a', 'b'], (_item, index) => {
          seen.push(index)
          return 'k'
        })
        expect(seen).toEqual([0, 1])
      })

      it('coerces the key with ToPropertyKey, so 1 and "1" merge', () => {
        // The difference from Map.groupBy, and the reason they are separate
        // algorithms rather than one with a container flag.
        const out = groupBy([1, 2], n => (n === 1 ? 1 : '1') as never)
        expect(Object.keys(out)).toEqual(['1'])
      })

      it('returns a null-prototype object', () => {
        // So a group named toString or __proto__ is an ordinary own property
        // rather than a collision with Object.prototype.
        const out = groupBy(['x'], () => 'toString')
        expect(Object.getPrototypeOf(out)).toBe(null)
        expect(out['toString' as never]).toEqual(['x'])
      })

      it('handles a __proto__ group without polluting anything', () => {
        const out = groupBy(['x'], () => '__proto__')
        expect(Object.getOwnPropertyNames(out)).toEqual(['__proto__'])
      })

      it('an empty iterable yields an empty object', () => {
        expect(Object.keys(groupBy([], () => 'k'))).toEqual([])
      })

      it('accepts any iterable, not only an array', () => {
        const out = groupBy(new Set([1, 2]), () => 'k')
        expect(out['k' as never]).toEqual([1, 2])
      })
    })
  }

  it('prefers the native method when the engine has one', () => {
    const picked = objectGroupByNative ?? objectGroupByShim
    const selectedIsPicked = objectGroupBy === picked
    expect(selectedIsPicked).toBe(true)
  })
})

describe('mapGroupBy', () => {
  for (const [label, groupBy] of [
    ['shim', mapGroupByShim],
    ['selected', mapGroupBy],
  ] as const) {
    describe(label, () => {
      it('groups by the returned key', () => {
        const out = groupBy([1, 2, 3], n => (n % 2 === 0 ? 'even' : 'odd'))
        expect(out.get('odd')).toEqual([1, 3])
        expect(out.get('even')).toEqual([2])
      })

      it('keys by SameValueZero, so 1 and "1" stay apart', () => {
        const out = groupBy([1, 2], n => (n === 1 ? 1 : '1'))
        expect(out.get(1)).toEqual([1])
        expect(out.get('1')).toEqual([2])
      })

      it('accepts an object as a key', () => {
        const key = {}
        const out = groupBy(['v'], () => key)
        expect(out.get(key)).toEqual(['v'])
      })

      it('groups NaN keys together, per SameValueZero', () => {
        const out = groupBy([1, 2], () => Number.NaN)
        expect(out.get(Number.NaN)).toEqual([1, 2])
      })

      it('an empty iterable yields an empty map', () => {
        expect(groupBy([], () => 'k').size).toBe(0)
      })
    })
  }

  it('prefers the native method when the engine has one', () => {
    const picked = mapGroupByNative ?? mapGroupByShim
    const selectedIsPicked = mapGroupBy === picked
    expect(selectedIsPicked).toBe(true)
  })
})
