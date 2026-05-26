/**
 * @file Unit tests for src/primordials/map-set — Map/Set/WeakMap/WeakSet
 *   prototype primordials. Focuses on the newer methods (Stage 3+ proposals
 *   Node ships ahead of the TS lib) where regressions are most likely.
 */

import { describe, expect, it } from 'vitest'

import {
  MapPrototypeGetOrInsert,
  MapPrototypeGetOrInsertComputed,
  SetPrototypeDifference,
  SetPrototypeIntersection,
  SetPrototypeIsDisjointFrom,
  SetPrototypeIsSubsetOf,
  SetPrototypeIsSupersetOf,
  SetPrototypeSymmetricDifference,
  SetPrototypeUnion,
  WeakMapPrototypeGetOrInsert,
  WeakMapPrototypeGetOrInsertComputed,
} from '../../../src/primordials/map-set'

describe('Map.prototype.getOrInsert primordials', () => {
  it('MapPrototypeGetOrInsert inserts when key is missing', () => {
    const m = new Map<string, number>()
    expect(MapPrototypeGetOrInsert(m, 'a', 1)).toBe(1)
    expect(m.get('a')).toBe(1)
  })

  it('MapPrototypeGetOrInsert returns the existing value without overwriting', () => {
    const m = new Map<string, number>([['a', 7]])
    expect(MapPrototypeGetOrInsert(m, 'a', 99)).toBe(7)
    expect(m.get('a')).toBe(7)
  })

  it('MapPrototypeGetOrInsertComputed only invokes the callback when missing', () => {
    const m = new Map<string, number>([['a', 7]])
    let calls = 0
    expect(
      MapPrototypeGetOrInsertComputed(m, 'a', () => {
        calls += 1
        return 99
      }),
    ).toBe(7)
    expect(calls).toBe(0)

    expect(
      MapPrototypeGetOrInsertComputed(m, 'b', () => {
        calls += 1
        return 42
      }),
    ).toBe(42)
    expect(calls).toBe(1)
    expect(m.get('b')).toBe(42)
  })

  it('MapPrototypeGetOrInsertComputed passes the key to the callback', () => {
    const m = new Map<string, string>()
    const result = MapPrototypeGetOrInsertComputed(m, 'foo', k =>
      k.toUpperCase(),
    )
    expect(result).toBe('FOO')
    expect(m.get('foo')).toBe('FOO')
  })
})

describe('WeakMap.prototype.getOrInsert primordials', () => {
  it('WeakMapPrototypeGetOrInsert inserts when key is missing', () => {
    const m = new WeakMap<object, number>()
    const key = {}
    expect(WeakMapPrototypeGetOrInsert(m, key, 1)).toBe(1)
    expect(m.get(key)).toBe(1)
  })

  it('WeakMapPrototypeGetOrInsert returns existing value', () => {
    const m = new WeakMap<object, number>()
    const key = {}
    m.set(key, 7)
    expect(WeakMapPrototypeGetOrInsert(m, key, 99)).toBe(7)
    expect(m.get(key)).toBe(7)
  })

  it('WeakMapPrototypeGetOrInsertComputed only invokes callback when missing', () => {
    const m = new WeakMap<object, number>()
    const key = {}
    let calls = 0
    expect(
      WeakMapPrototypeGetOrInsertComputed(m, key, () => {
        calls += 1
        return 42
      }),
    ).toBe(42)
    expect(calls).toBe(1)
    expect(
      WeakMapPrototypeGetOrInsertComputed(m, key, () => {
        calls += 1
        return 99
      }),
    ).toBe(42)
    expect(calls).toBe(1)
  })
})

describe('Set composition primordials', () => {
  const a = new Set([1, 2, 3])
  const b = new Set([2, 3, 4])

  it('SetPrototypeDifference returns elements in a but not b', () => {
    const result = SetPrototypeDifference(a, b)
    expect([...result].sort()).toEqual([1])
  })

  it('SetPrototypeIntersection returns elements in both', () => {
    const result = SetPrototypeIntersection(a, b)
    expect([...result].sort()).toEqual([2, 3])
  })

  it('SetPrototypeUnion returns elements in either', () => {
    const result = SetPrototypeUnion(a, b)
    expect([...result].sort()).toEqual([1, 2, 3, 4])
  })

  it('SetPrototypeSymmetricDifference returns elements in either but not both', () => {
    const result = SetPrototypeSymmetricDifference(a, b)
    expect([...result].sort()).toEqual([1, 4])
  })

  it('SetPrototypeIsSubsetOf returns true when all elements appear in the other', () => {
    expect(SetPrototypeIsSubsetOf(new Set([2, 3]), a)).toBe(true)
    expect(SetPrototypeIsSubsetOf(a, b)).toBe(false)
  })

  it('SetPrototypeIsSupersetOf returns true when all of the other appear in this', () => {
    expect(SetPrototypeIsSupersetOf(a, new Set([2, 3]))).toBe(true)
    expect(SetPrototypeIsSupersetOf(a, b)).toBe(false)
  })

  it('SetPrototypeIsDisjointFrom returns true when no elements are shared', () => {
    expect(SetPrototypeIsDisjointFrom(a, new Set([10, 20]))).toBe(true)
    expect(SetPrototypeIsDisjointFrom(a, b)).toBe(false)
  })
})
