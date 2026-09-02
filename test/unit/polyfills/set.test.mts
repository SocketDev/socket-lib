/*
 * @file Unit tests for the ES2025 Set-method shims.
 *
 *   test262 covers spec conformance; these cover what it cannot see - the
 *   three-export shape, the native/shim selection, and the set-like contract
 *   documented on `setRecordOf`. The behaviors that were WRONG before test262
 *   ran are pinned here too, so a future rewrite cannot quietly undo them.
 */

import { describe, expect, it } from 'vitest'

import {
  nativeSetCombine,
  nativeSetPredicate,
  setDifference,
  setDifferenceNative,
  setDifferenceShim,
  setIntersection,
  setIntersectionNative,
  setIntersectionShim,
  setIsDisjointFrom,
  setIsDisjointFromNative,
  setIsDisjointFromShim,
  setIsSubsetOf,
  setIsSubsetOfNative,
  setIsSubsetOfShim,
  setIsSupersetOf,
  setIsSupersetOfNative,
  setIsSupersetOfShim,
  setRecordOf,
  setSymmetricDifference,
  setSymmetricDifferenceNative,
  setSymmetricDifferenceShim,
  setUnion,
  setUnionNative,
  setUnionShim,
} from '../../../src/polyfills/set.mjs'

/**
 * A minimal set-like backed by an array, which is what these methods accept
 * beside a real Set.
 */
function setLike(values: readonly number[]) {
  return {
    has: (value: number) => values.includes(value),
    keys: () => values[Symbol.iterator](),
    size: values.length,
  }
}

describe('setRecordOf', () => {
  it('reads size, then has, then keys', () => {
    // Order matters: a set-like whose size getter throws must never reach the
    // has lookup.
    const reads: string[] = []
    const probe = {
      get size() {
        reads.push('size')
        return 1
      },
      get has() {
        reads.push('has')
        return () => true
      },
      get keys() {
        reads.push('keys')
        return () => [1][Symbol.iterator]()
      },
    }
    setRecordOf(probe)
    expect(reads).toEqual(['size', 'has', 'keys'])
  })

  it('throws a TypeError when size is undefined, via NaN', () => {
    expect(() =>
      setRecordOf({ has: () => true, keys: () => [][Symbol.iterator]() }),
    ).toThrow(TypeError)
  })

  it('throws a TypeError on a BigInt size', () => {
    // `Number(1n)` quietly returns 1, so a shim built on the Number
    // constructor accepts this where the spec's ToNumber throws.
    expect(() =>
      setRecordOf({
        has: () => true,
        keys: () => [][Symbol.iterator](),
        size: 1n,
      }),
    ).toThrow(TypeError)
  })

  it('throws a RangeError on a negative size', () => {
    expect(() =>
      setRecordOf({
        has: () => true,
        keys: () => [][Symbol.iterator](),
        size: -1,
      }),
    ).toThrow(RangeError)
  })

  it('coerces a numeric string size', () => {
    expect(
      setRecordOf({ has: () => true, keys: () => [], size: '2' }).size,
    ).toBe(2)
  })

  it('truncates a fractional size', () => {
    expect(
      setRecordOf({ has: () => true, keys: () => [], size: 2.9 }).size,
    ).toBe(2)
  })

  it('throws a TypeError when has is not callable', () => {
    expect(() => setRecordOf({ has: 1, keys: () => [], size: 1 })).toThrow(
      TypeError,
    )
  })

  it('throws a TypeError when keys is not callable', () => {
    expect(() => setRecordOf({ has: () => true, keys: 1, size: 1 })).toThrow(
      TypeError,
    )
  })

  it('throws a TypeError on a non-object', () => {
    expect(() => setRecordOf(undefined)).toThrow(TypeError)
    expect(() => setRecordOf(3)).toThrow(TypeError)
  })
})

describe('the combining methods', () => {
  for (const [label, union, intersection, difference, symmetric] of [
    [
      'shim',
      setUnionShim,
      setIntersectionShim,
      setDifferenceShim,
      setSymmetricDifferenceShim,
    ],
    [
      'selected',
      setUnion,
      setIntersection,
      setDifference,
      setSymmetricDifference,
    ],
  ] as const) {
    describe(label, () => {
      it('union keeps the receiver order, then the new elements', () => {
        // Built by `add` rather than from a literal: the receiver's order is
        // the assertion, and a literal is a target for a sorting autofix.
        const receiver = new Set<number>()
        receiver.add(3)
        receiver.add(1)
        expect([...union(receiver, setLike([1, 2]))]).toEqual([3, 1, 2])
      })

      it('intersection keeps only shared elements', () => {
        expect([
          ...intersection(new Set([1, 2, 3]), setLike([2, 3, 4])),
        ]).toEqual([2, 3])
      })

      it('difference drops what the other side has', () => {
        expect([...difference(new Set([1, 2, 3]), setLike([2]))]).toEqual([
          1, 3,
        ])
      })

      it('symmetricDifference keeps what is in exactly one side', () => {
        expect([...symmetric(new Set([1, 2]), setLike([2, 3]))]).toEqual([1, 3])
      })

      it('leaves the receiver untouched', () => {
        const receiver = new Set([1, 2])
        union(receiver, setLike([3]))
        intersection(receiver, setLike([1]))
        difference(receiver, setLike([1]))
        symmetric(receiver, setLike([2]))
        expect([...receiver]).toEqual([1, 2])
      })

      it('returns a plain Set even from a subclass receiver', () => {
        class SubSet<T> extends Set<T> {}
        const out = union(new SubSet([1]), setLike([2]))
        const isSubclass = out instanceof SubSet
        expect(isSubclass).toBe(false)
      })

      it('does not call a patched Set.prototype.add', () => {
        // The result is built through a primordial, so a caller that patches
        // `add` sees no calls - which is what the spec requires.
        //
        // The inputs are built BEFORE the patch: `new Set([1])` calls `add`
        // itself, so constructing inside the patched window would measure the
        // test's own setup.
        const receiver = new Set([1])
        const other = setLike([2])
        const original = Set.prototype.add
        let calls = 0
        // Patching the prototype IS the measurement: it is the only way to
        // observe whether union reaches for the overridable `add`. Restored in
        // the finally below.
        // oxlint-disable-next-line no-extend-native -- see above
        Set.prototype.add = function patched(this: Set<unknown>, value) {
          calls += 1
          return original.call(this, value)
        }
        try {
          union(receiver, other)
        } finally {
          // oxlint-disable-next-line no-extend-native -- restores the original
          Set.prototype.add = original
        }
        expect(calls).toBe(0)
      })
    })
  }

  it('prefers the native methods when the engine has them', () => {
    const unionPicked = setUnionNative ?? setUnionShim
    const interPicked = setIntersectionNative ?? setIntersectionShim
    const diffPicked = setDifferenceNative ?? setDifferenceShim
    const symPicked = setSymmetricDifferenceNative ?? setSymmetricDifferenceShim
    const allSelected =
      setUnion === unionPicked &&
      setIntersection === interPicked &&
      setDifference === diffPicked &&
      setSymmetricDifference === symPicked
    expect(allSelected).toBe(true)
  })
})

describe('the native-detection factories', () => {
  // Every Set method exists on a modern engine, so the "no native" side of
  // each `Native ?? Shim` pair is unreachable through the public exports.
  it('nativeSetCombine returns undefined for a method Set lacks', () => {
    expect(nativeSetCombine('definitelyNotAMethod')).toBe(undefined)
  })

  it('nativeSetCombine forwards the receiver and argument', () => {
    const bridge = nativeSetCombine('union')
    expect(typeof bridge).toBe('function')
    expect([...bridge!(new Set([1]), setLike([2]))]).toEqual([1, 2])
  })

  it('nativeSetPredicate returns undefined for a method Set lacks', () => {
    expect(nativeSetPredicate('definitelyNotAMethod')).toBe(undefined)
  })

  it('nativeSetPredicate coerces the result to a boolean', () => {
    const bridge = nativeSetPredicate('isSubsetOf')
    expect(typeof bridge).toBe('function')
    expect(bridge!(new Set([1]), setLike([1, 2]))).toBe(true)
  })
})

describe('the predicate methods', () => {
  for (const [label, isSubsetOf, isSupersetOf, isDisjointFrom] of [
    ['shim', setIsSubsetOfShim, setIsSupersetOfShim, setIsDisjointFromShim],
    ['selected', setIsSubsetOf, setIsSupersetOf, setIsDisjointFrom],
  ] as const) {
    describe(label, () => {
      it('isSubsetOf is true for a contained set', () => {
        expect(isSubsetOf(new Set([1, 2]), setLike([1, 2, 3]))).toBe(true)
      })

      it('isSubsetOf is false when an element is missing', () => {
        expect(isSubsetOf(new Set([1, 4]), setLike([1, 2, 3]))).toBe(false)
      })

      it('isSubsetOf is false when the receiver is larger', () => {
        expect(isSubsetOf(new Set([1, 2, 3]), setLike([1, 2]))).toBe(false)
      })

      it('isSupersetOf is true for a containing set', () => {
        expect(isSupersetOf(new Set([1, 2, 3]), setLike([1, 2]))).toBe(true)
      })

      it('isSupersetOf is false when an element is missing', () => {
        expect(isSupersetOf(new Set([1, 2, 3]), setLike([1, 9]))).toBe(false)
      })

      it('isDisjointFrom is true when nothing overlaps', () => {
        expect(isDisjointFrom(new Set([1, 2]), setLike([3, 4]))).toBe(true)
      })

      it('isDisjointFrom is false when something overlaps', () => {
        expect(isDisjointFrom(new Set([1, 2]), setLike([2, 3]))).toBe(false)
      })

      it('isSubsetOf iterates the receiver LIVE', () => {
        // The set-like's `has` deletes from the receiver mid-run, and the
        // deleted element must never be visited. A snapshot would visit it and
        // wrongly answer false.
        const receiver = new Set(['a', 'b', 'c'])
        const tampered = {
          has(value: string) {
            if (value === 'a') {
              receiver.delete('c')
            }
            return ['x', 'a', 'b'].includes(value)
          },
          keys: () => {
            throw new Error('keys must not be called')
          },
          size: 3,
        }
        expect(isSubsetOf(receiver, tampered)).toBe(true)
        expect([...receiver]).toEqual(['a', 'b'])
      })

      it('isSupersetOf closes the set-like iterator when it stops early', () => {
        // Only owed when the iterator is NOT exhausted, which is the case that
        // returns false.
        let returnCalls = 0
        const values = [1, 9]
        let index = 0
        const iterator: Iterator<number> = {
          next: (): IteratorResult<number> =>
            index >= values.length
              ? { done: true, value: undefined }
              : { done: false, value: values[index++]! },
          return: (): IteratorResult<number> => {
            returnCalls += 1
            return { done: true, value: undefined }
          },
        }
        const other = {
          has: (value: number) => values.includes(value),
          keys: () => iterator,
          size: 2,
        }
        expect(isSupersetOf(new Set([1, 2, 3]), other)).toBe(false)
        expect(returnCalls).toBe(1)
      })
    })
  }

  it('prefers the native methods when the engine has them', () => {
    const subPicked = setIsSubsetOfNative ?? setIsSubsetOfShim
    const superPicked = setIsSupersetOfNative ?? setIsSupersetOfShim
    const disjointPicked = setIsDisjointFromNative ?? setIsDisjointFromShim
    const allSelected =
      setIsSubsetOf === subPicked &&
      setIsSupersetOf === superPicked &&
      setIsDisjointFrom === disjointPicked
    expect(allSelected).toBe(true)
  })
})
