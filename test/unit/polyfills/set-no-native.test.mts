/**
 * @file The set combinators on an engine that ships none of them. Each
 *   `set<Name>` export picks the native `Set.prototype` method when the engine
 *   has one and the shim otherwise; Node 22 and up have them all, so the shim
 *   half of every pick was decided at module load and never taken. Handing the
 *   module a Set whose prototype hides those seven methods makes the Node-18
 *   path the one that runs.
 */

import { beforeAll, describe, expect, it, vi } from 'vitest'

const HIDDEN = [
  'difference',
  'intersection',
  'isDisjointFrom',
  'isSubsetOf',
  'isSupersetOf',
  'symmetricDifference',
  'union',
]

vi.mock(import('../../../src/primordials/map-set.mjs'), async orig => {
  const actual = await orig()
  // A real Set in every respect the shims use, with the combinators shadowed
  // so the prototype lookup finds nothing callable.
  class SetWithoutCombinators<T> extends actual.SetCtor<T> {}
  for (let i = 0, { length } = HIDDEN; i < length; i += 1) {
    Object.defineProperty(SetWithoutCombinators.prototype, HIDDEN[i]!, {
      configurable: true,
      value: undefined,
      writable: true,
    })
  }
  return {
    ...actual,
    SetCtor: SetWithoutCombinators as unknown as typeof actual.SetCtor,
  }
})

import type * as SetPolyfills from '../../../src/polyfills/set.mjs'

let sets: typeof SetPolyfills

beforeAll(async () => {
  sets = await import('../../../src/polyfills/set.mjs')
})

describe('the native lookups', () => {
  it('are looking at an engine that does have the natives', () => {
    // Without this the suite would pass on an engine below Node 22 for the
    // wrong reason, and prove nothing about the fallback.
    expect(typeof Set.prototype.union).toBe('function')
  })

  it('are reading the module under test, not a second copy of it', () => {
    // The shims build their result with the same SetCtor the lookups read, so
    // a result carrying the stand-in's name proves the mock reached the module
    // rather than only the test's own import of it.
    expect(sets.setUnion(new Set([1]), new Set([2])).constructor.name).toBe(
      'SetWithoutCombinators',
    )
  })

  it('find no combining method to bridge', () => {
    expect(sets.setUnionNative).toBeUndefined()
    expect(sets.setIntersectionNative).toBeUndefined()
    expect(sets.setDifferenceNative).toBeUndefined()
    expect(sets.setSymmetricDifferenceNative).toBeUndefined()
  })

  it('find no predicate to bridge', () => {
    expect(sets.setIsDisjointFromNative).toBeUndefined()
    expect(sets.setIsSubsetOfNative).toBeUndefined()
    expect(sets.setIsSupersetOfNative).toBeUndefined()
  })
})

describe('the exported combinators on that engine', () => {
  const left = new Set([1, 2, 3])
  const right = new Set([3, 4])

  it('union keeps the receiver order, then the new elements', () => {
    expect([...sets.setUnion(left, right)]).toEqual([1, 2, 3, 4])
  })

  it('intersection keeps only shared elements', () => {
    expect([...sets.setIntersection(left, right)]).toEqual([3])
  })

  it('difference drops what the other side has', () => {
    expect([...sets.setDifference(left, right)]).toEqual([1, 2])
  })

  it('symmetricDifference keeps what is in exactly one side', () => {
    expect([...sets.setSymmetricDifference(left, right)]).toEqual([1, 2, 4])
  })
})

describe('the exported predicates on that engine', () => {
  it('answer for a contained set', () => {
    expect(sets.setIsSubsetOf(new Set([1]), new Set([1, 2]))).toBe(true)
    expect(sets.setIsSupersetOf(new Set([1, 2]), new Set([1]))).toBe(true)
    expect(sets.setIsDisjointFrom(new Set([1]), new Set([2]))).toBe(true)
  })

  it('answer for a set that overlaps', () => {
    expect(sets.setIsSubsetOf(new Set([1, 9]), new Set([1, 2]))).toBe(false)
    expect(sets.setIsDisjointFrom(new Set([1]), new Set([1, 2]))).toBe(false)
  })
})
