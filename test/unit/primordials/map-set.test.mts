/**
 * @file Unit tests for src/primordials/map-set — Map/Set/WeakMap/WeakSet
 *   prototype primordials. Focuses on the newer methods (Stage 3+ proposals
 *   Node ships ahead of the TS lib) where regressions are most likely.
 */

import { describe, expect, it } from 'vitest'

import {
  mapGetOrInsertComputedFallback,
  mapGetOrInsertFallback,
  MapPrototypeClear,
  MapPrototypeDelete,
  MapPrototypeEntries,
  MapPrototypeForEach,
  MapPrototypeGet,
  MapPrototypeGetOrInsert,
  MapPrototypeGetOrInsertComputed,
  MapPrototypeHas,
  MapPrototypeKeys,
  MapPrototypeSet,
  MapPrototypeValues,
  SetPrototypeAdd,
  SetPrototypeClear,
  SetPrototypeDelete,
  SetPrototypeDifference,
  SetPrototypeEntries,
  SetPrototypeForEach,
  SetPrototypeHas,
  SetPrototypeIntersection,
  SetPrototypeIsDisjointFrom,
  SetPrototypeIsSubsetOf,
  SetPrototypeIsSupersetOf,
  SetPrototypeKeys,
  SetPrototypeSymmetricDifference,
  SetPrototypeUnion,
  SetPrototypeValues,
  weakMapGetOrInsertComputedFallback,
  weakMapGetOrInsertFallback,
  WeakMapPrototypeDelete,
  WeakMapPrototypeGet,
  WeakMapPrototypeGetOrInsert,
  WeakMapPrototypeGetOrInsertComputed,
  WeakMapPrototypeHas,
  WeakMapPrototypeSet,
  WeakSetPrototypeAdd,
  WeakSetPrototypeDelete,
  WeakSetPrototypeHas,
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
    expect([...result].toSorted()).toEqual([1])
  })

  it('SetPrototypeIntersection returns elements in both', () => {
    const result = SetPrototypeIntersection(a, b)
    expect([...result].toSorted()).toEqual([2, 3])
  })

  it('SetPrototypeUnion returns elements in either', () => {
    const result = SetPrototypeUnion(a, b)
    expect([...result].toSorted()).toEqual([1, 2, 3, 4])
  })

  it('SetPrototypeSymmetricDifference returns elements in either but not both', () => {
    const result = SetPrototypeSymmetricDifference(a, b)
    expect([...result].toSorted()).toEqual([1, 4])
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

describe('Map (prototype) — core CRUD', () => {
  it('Clear / Delete / Get / Has / Set / Keys / Values / Entries / ForEach', () => {
    const m = new Map<string, number>()
    MapPrototypeSet(m, 'a', 1)
    MapPrototypeSet(m, 'b', 2)
    expect(MapPrototypeGet(m, 'a')).toBe(1)
    expect(MapPrototypeHas(m, 'b')).toBe(true)
    expect([...MapPrototypeKeys(m)]).toEqual(['a', 'b'])
    expect([...MapPrototypeValues(m)]).toEqual([1, 2])
    expect([...MapPrototypeEntries(m)]).toEqual([
      ['a', 1],
      ['b', 2],
    ])
    const seen: Array<[string, number]> = []
    MapPrototypeForEach(m, (v, k) => seen.push([k, v]))
    expect(seen).toEqual([
      ['a', 1],
      ['b', 2],
    ])
    MapPrototypeDelete(m, 'a')
    expect(MapPrototypeHas(m, 'a')).toBe(false)
    MapPrototypeClear(m)
    expect(m.size).toBe(0)
  })
})

describe('Set (prototype) — core CRUD', () => {
  it('Add / Clear / Delete / Entries / ForEach / Has / Keys / Values', () => {
    const s = new Set<number>()
    SetPrototypeAdd(s, 1)
    SetPrototypeAdd(s, 2)
    expect(SetPrototypeHas(s, 1)).toBe(true)
    expect([...SetPrototypeKeys(s)]).toEqual([1, 2])
    expect([...SetPrototypeValues(s)]).toEqual([1, 2])
    expect([...SetPrototypeEntries(s)]).toEqual([
      [1, 1],
      [2, 2],
    ])
    const seen: number[] = []
    SetPrototypeForEach(s, v => seen.push(v))
    expect(seen).toEqual([1, 2])
    SetPrototypeDelete(s, 1)
    expect(SetPrototypeHas(s, 1)).toBe(false)
    SetPrototypeClear(s)
    expect(s.size).toBe(0)
  })
})

describe('WeakMap (prototype) — core CRUD', () => {
  it('Get / Has / Set / Delete', () => {
    const wm = new WeakMap<object, number>()
    const key = {}
    WeakMapPrototypeSet(wm, key, 42)
    expect(WeakMapPrototypeHas(wm, key)).toBe(true)
    expect(WeakMapPrototypeGet(wm, key)).toBe(42)
    WeakMapPrototypeDelete(wm, key)
    expect(WeakMapPrototypeHas(wm, key)).toBe(false)
  })
})

describe('WeakSet (prototype)', () => {
  it('Add / Has / Delete', () => {
    const ws = new WeakSet<object>()
    const key = {}
    WeakSetPrototypeAdd(ws, key)
    expect(WeakSetPrototypeHas(ws, key)).toBe(true)
    WeakSetPrototypeDelete(ws, key)
    expect(WeakSetPrototypeHas(ws, key)).toBe(false)
  })
})

// ─── proposal-upsert fallbacks ──────────────────────────────────
//
// The conditional exports above resolve to the NATIVE methods on a Node that
// ships proposal-upsert, so these fallbacks are unreachable through them on a
// modern runtime. `engines` allows >=22, where the natives are absent and these
// are what actually run — so they are exercised directly rather than left to
// whichever Node happens to run the suite.

describe('mapGetOrInsertFallback', () => {
  it('returns the existing value without overwriting it', () => {
    const map = new Map([['k', 'first']])
    expect(mapGetOrInsertFallback(map, 'k', 'second')).toBe('first')
    expect(map.get('k')).toBe('first')
  })

  it('inserts and returns the value on a miss', () => {
    const map = new Map<string, string>()
    expect(mapGetOrInsertFallback(map, 'k', 'inserted')).toBe('inserted')
    expect(map.get('k')).toBe('inserted')
  })

  it('treats a stored undefined as present, not missing', () => {
    // `has` decides, not a truthiness check on `get`.
    const map = new Map<string, undefined>([['k', undefined]])
    expect(mapGetOrInsertFallback(map, 'k', undefined)).toBe(undefined)
    expect(map.size).toBe(1)
  })
})

describe('mapGetOrInsertComputedFallback', () => {
  it('does not invoke the callback when the key exists', () => {
    const map = new Map([['k', 'first']])
    let calls = 0
    const out = mapGetOrInsertComputedFallback(map, 'k', () => {
      calls += 1
      return 'computed'
    })
    expect(out).toBe('first')
    expect(calls).toBe(0)
  })

  it('invokes the callback with the key on a miss and stores the result', () => {
    const map = new Map<string, string>()
    const seen: string[] = []
    const out = mapGetOrInsertComputedFallback(map, 'k', key => {
      seen.push(key)
      return `computed:${key}`
    })
    expect(out).toBe('computed:k')
    expect(seen).toEqual(['k'])
    expect(map.get('k')).toBe('computed:k')
  })

  it("stores the callback's result even when the callback mutated the map", () => {
    // Per the proposal the computed value wins over a write made during the
    // callback.
    const map = new Map<string, string>()
    const out = mapGetOrInsertComputedFallback(map, 'k', () => {
      map.set('k', 'set-inside-callback')
      return 'computed'
    })
    expect(out).toBe('computed')
    expect(map.get('k')).toBe('computed')
  })

  it('throws a TypeError when the callback is not a function', () => {
    const map = new Map<string, string>()
    expect(() =>
      (
        mapGetOrInsertComputedFallback as unknown as (
          m: unknown,
          k: unknown,
          c: unknown,
        ) => unknown
      )(map, 'k', 'not-a-function'),
    ).toThrow(TypeError)
  })
})

describe('weakMapGetOrInsertFallback', () => {
  it('returns the existing value without overwriting it', () => {
    const key = {}
    const map = new WeakMap([[key, 'first']])
    expect(weakMapGetOrInsertFallback(map, key, 'second')).toBe('first')
    expect(map.get(key)).toBe('first')
  })

  it('inserts and returns the value on a miss', () => {
    const key = {}
    const map = new WeakMap<object, string>()
    expect(weakMapGetOrInsertFallback(map, key, 'inserted')).toBe('inserted')
    expect(map.get(key)).toBe('inserted')
  })
})

describe('weakMapGetOrInsertComputedFallback', () => {
  it('does not invoke the callback when the key exists', () => {
    const key = {}
    const map = new WeakMap([[key, 'first']])
    let calls = 0
    const out = weakMapGetOrInsertComputedFallback(map, key, () => {
      calls += 1
      return 'computed'
    })
    expect(out).toBe('first')
    expect(calls).toBe(0)
  })

  it('invokes the callback with the key on a miss and stores the result', () => {
    const key = { id: 1 }
    const map = new WeakMap<object, string>()
    const seen: object[] = []
    const out = weakMapGetOrInsertComputedFallback(map, key, k => {
      seen.push(k)
      return 'computed'
    })
    expect(out).toBe('computed')
    expect(seen).toEqual([key])
    expect(map.get(key)).toBe('computed')
  })

  it('throws a TypeError when the callback is not a function', () => {
    const map = new WeakMap<object, string>()
    expect(() =>
      (
        weakMapGetOrInsertComputedFallback as unknown as (
          m: unknown,
          k: unknown,
          c: unknown,
        ) => unknown
      )(map, {}, undefined),
    ).toThrow(TypeError)
  })
})
