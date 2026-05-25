/**
 * @file Unit tests for src/primordials/array — Array static + prototype
 *   primordials. Split out of the historical monolithic
 *   test/unit/primordials.test.mts to keep each test file under the fleet's
 *   500-line soft cap.
 */

import { describe, expect, it } from 'vitest'

import {
  ArrayFrom,
  ArrayFromAsync,
  ArrayIsArray,
  ArrayOf,
  ArrayPrototypeAt,
  ArrayPrototypeConcat,
  ArrayPrototypeCopyWithin,
  ArrayPrototypeEntries,
  ArrayPrototypeEvery,
  ArrayPrototypeFill,
  ArrayPrototypeFilter,
  ArrayPrototypeFind,
  ArrayPrototypeFindIndex,
  ArrayPrototypeFindLast,
  ArrayPrototypeFindLastIndex,
  ArrayPrototypeFlat,
  ArrayPrototypeFlatMap,
  ArrayPrototypeForEach,
  ArrayPrototypeIncludes,
  ArrayPrototypeIndexOf,
  ArrayPrototypeJoin,
  ArrayPrototypeKeys,
  ArrayPrototypeLastIndexOf,
  ArrayPrototypeMap,
  ArrayPrototypePop,
  ArrayPrototypePush,
  ArrayPrototypeReduce,
  ArrayPrototypeReduceRight,
  ArrayPrototypeReverse,
  ArrayPrototypeShift,
  ArrayPrototypeSlice,
  ArrayPrototypeSome,
  ArrayPrototypeSort,
  ArrayPrototypeSplice,
  ArrayPrototypeToReversed,
  ArrayPrototypeToSorted,
  ArrayPrototypeToSpliced,
  ArrayPrototypeUnshift,
  ArrayPrototypeValues,
  ArrayPrototypeWith,
} from '../../../src/primordials/array'

describe('Array (static)', () => {
  it('ArrayFrom converts array-likes and iterables', () => {
    expect(ArrayFrom('abc')).toEqual(['a', 'b', 'c'])
    expect(ArrayFrom({ length: 3, 0: 'a', 1: 'b', 2: 'c' })).toEqual([
      'a',
      'b',
      'c',
    ])
  })

  it('ArrayIsArray narrows correctly', () => {
    expect(ArrayIsArray([1, 2])).toBe(true)
    expect(ArrayIsArray({ length: 2 })).toBe(false)
    expect(ArrayIsArray('abc')).toBe(false)
  })

  it('ArrayOf composes from args', () => {
    expect(ArrayOf(1, 2, 3)).toEqual([1, 2, 3])
  })

  // ArrayFromAsync is typed `| undefined` because the proposal is
  // ES2024; on Node 22+ it's always present. Covers the unbound
  // form — the spec algorithm uses `this` only for the constructor
  // and falls back to plain Array when `this` is undefined.
  it('ArrayFromAsync is defined on Node 22+', () => {
    expect(typeof ArrayFromAsync).toBe('function')
  })

  it('ArrayFromAsync drains an async iterable', async () => {
    async function* gen() {
      yield 1
      yield 2
      yield 3
    }
    await expect(ArrayFromAsync!(gen())).resolves.toEqual([1, 2, 3])
  })

  it('ArrayFromAsync awaits yielded thenables', async () => {
    async function* gen() {
      yield Promise.resolve('a')
      yield Promise.resolve('b')
    }
    await expect(ArrayFromAsync!(gen())).resolves.toEqual(['a', 'b'])
  })

  it('ArrayFromAsync accepts plain iterables of awaitables', async () => {
    // Spec: source can also be Iterable<T | PromiseLike<T>>.
    await expect(
      ArrayFromAsync!([Promise.resolve(1), Promise.resolve(2)]),
    ).resolves.toEqual([1, 2])
  })

  it('ArrayFromAsync returns a plain Array when called unbound', async () => {
    const fn = ArrayFromAsync!
    async function* gen() {
      yield 1
    }
    const out = await fn(gen())
    expect(out).toBeInstanceOf(Array)
    expect(Object.getPrototypeOf(out)).toBe(Array.prototype)
  })

  it('ArrayFromAsync propagates rejection from the iterator', async () => {
    const err = new Error('boom')
    async function* gen() {
      yield 1
      throw err
    }
    await expect(ArrayFromAsync!(gen())).rejects.toBe(err)
  })
})

describe('Array (prototype)', () => {
  it('ArrayPrototypeAt supports negative indexing', () => {
    expect(ArrayPrototypeAt([1, 2, 3], -1)).toBe(3)
    expect(ArrayPrototypeAt([1, 2, 3], 0)).toBe(1)
  })

  it('ArrayPrototypeConcat merges arrays', () => {
    expect(ArrayPrototypeConcat([1], [2, 3], [4])).toEqual([1, 2, 3, 4])
  })

  it('ArrayPrototypeCopyWithin mutates in place', () => {
    const arr = [1, 2, 3, 4, 5]
    ArrayPrototypeCopyWithin(arr, 0, 3)
    expect(arr).toEqual([4, 5, 3, 4, 5])
  })

  it('ArrayPrototypeEntries yields index/value pairs', () => {
    expect([...ArrayPrototypeEntries(['a', 'b'])]).toEqual([
      [0, 'a'],
      [1, 'b'],
    ])
  })

  it('ArrayPrototypeEvery / Some behave correctly', () => {
    expect(ArrayPrototypeEvery([1, 2, 3], (x: number) => x > 0)).toBe(true)
    expect(ArrayPrototypeEvery([1, -2, 3], (x: number) => x > 0)).toBe(false)
    expect(ArrayPrototypeSome([1, 2], (x: number) => x > 1)).toBe(true)
    expect(ArrayPrototypeSome([1, 1], (x: number) => x > 1)).toBe(false)
  })

  it('ArrayPrototypeFill / Find / FindIndex / FindLast / FindLastIndex', () => {
    expect(ArrayPrototypeFill([0, 0, 0], 7)).toEqual([7, 7, 7])
    expect(ArrayPrototypeFind([1, 2, 3], (x: number) => x === 2)).toBe(2)
    expect(ArrayPrototypeFindIndex([1, 2, 3], (x: number) => x === 3)).toBe(2)
    expect(ArrayPrototypeFindLast([1, 2, 3, 2], (x: number) => x === 2)).toBe(2)
    expect(
      ArrayPrototypeFindLastIndex([1, 2, 3, 2], (x: number) => x === 2),
    ).toBe(3)
  })

  it('ArrayPrototypeFilter / Map / FlatMap / Flat', () => {
    expect(ArrayPrototypeFilter([1, 2, 3], (x: number) => x > 1)).toEqual([
      2, 3,
    ])
    expect(ArrayPrototypeMap([1, 2, 3], (x: number) => x * 2)).toEqual([
      2, 4, 6,
    ])
    expect(ArrayPrototypeFlatMap([1, 2], (x: number) => [x, x])).toEqual([
      1, 1, 2, 2,
    ])
    expect(ArrayPrototypeFlat([[1, 2], [3]])).toEqual([1, 2, 3])
  })

  it('ArrayPrototypeForEach invokes callback', () => {
    const seen: number[] = []
    ArrayPrototypeForEach([1, 2, 3], (x: number) => seen.push(x))
    expect(seen).toEqual([1, 2, 3])
  })

  it('ArrayPrototypeIncludes / IndexOf / LastIndexOf', () => {
    expect(ArrayPrototypeIncludes([1, 2, 3], 2)).toBe(true)
    expect(ArrayPrototypeIndexOf([1, 2, 1], 1)).toBe(0)
    expect(ArrayPrototypeLastIndexOf([1, 2, 1], 1)).toBe(2)
  })

  it('ArrayPrototypeJoin / Keys / Values', () => {
    expect(ArrayPrototypeJoin(['a', 'b', 'c'], '-')).toBe('a-b-c')
    expect([...ArrayPrototypeKeys(['a', 'b'])]).toEqual([0, 1])
    expect([...ArrayPrototypeValues(['a', 'b'])]).toEqual(['a', 'b'])
  })

  it('ArrayPrototypePush / Pop / Shift / Unshift / Splice', () => {
    const arr: number[] = []
    expect(ArrayPrototypePush(arr, 1, 2, 3)).toBe(3)
    expect(ArrayPrototypePop(arr)).toBe(3)
    expect(ArrayPrototypeShift(arr)).toBe(1)
    expect(ArrayPrototypeUnshift(arr, 9, 8)).toBe(3)
    expect(arr).toEqual([9, 8, 2])
    expect(ArrayPrototypeSplice(arr, 1, 1, 5)).toEqual([8])
    expect(arr).toEqual([9, 5, 2])
  })

  it('ArrayPrototypeReduce / ReduceRight', () => {
    expect(
      ArrayPrototypeReduce(
        [1, 2, 3],
        ((a: number, b: number) => a + b) as never,
        0,
      ),
    ).toBe(6)
    expect(
      ArrayPrototypeReduceRight(
        ['a', 'b', 'c'],
        ((acc: string, x: string) => acc + x) as never,
        '',
      ),
    ).toBe('cba')
  })

  it('ArrayPrototypeReverse mutates; ArrayPrototypeToReversed copies', () => {
    const a = [1, 2, 3]
    ArrayPrototypeReverse(a)
    expect(a).toEqual([3, 2, 1])
    const b = [1, 2, 3]
    expect(ArrayPrototypeToReversed(b)).toEqual([3, 2, 1])
    expect(b).toEqual([1, 2, 3])
  })

  it('ArrayPrototypeSlice / Sort / ToSorted', () => {
    expect(ArrayPrototypeSlice([1, 2, 3, 4], 1, 3)).toEqual([2, 3])
    const a = [3, 1, 2]
    ArrayPrototypeSort(a, (x: number, y: number) => x - y)
    expect(a).toEqual([1, 2, 3])
    const b = [3, 1, 2]
    expect(ArrayPrototypeToSorted(b, (x: number, y: number) => x - y)).toEqual([
      1, 2, 3,
    ])
    expect(b).toEqual([3, 1, 2])
  })

  it('ArrayPrototypeToSpliced returns a copy with edits', () => {
    const a: Array<number | string> = [1, 2, 3, 4]
    const out = ArrayPrototypeToSpliced(a, 1, 2, 'a', 'b', 'c')
    expect(out).toEqual([1, 'a', 'b', 'c', 4])
    // Source unchanged (Change Array By Copy invariant).
    expect(a).toEqual([1, 2, 3, 4])
  })

  it('ArrayPrototypeWith returns a copy with one index replaced', () => {
    const a = [10, 20, 30]
    expect(ArrayPrototypeWith(a, 1, 99)).toEqual([10, 99, 30])
    // Negative index counts from the end.
    expect(ArrayPrototypeWith(a, -1, 99)).toEqual([10, 20, 99])
    // Source unchanged.
    expect(a).toEqual([10, 20, 30])
  })
})
