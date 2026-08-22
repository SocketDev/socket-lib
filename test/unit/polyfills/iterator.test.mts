/*
 * @file Unit tests for the iterator-helper shims.
 *
 *   test262 covers spec conformance across 408 tests; these cover what it
 *   cannot see - the native/shim selection this package adds - plus the
 *   behaviors that were WRONG before test262 ran, pinned so a rewrite cannot
 *   quietly undo them.
 */

import { describe, expect, it } from 'vitest'

import {
  iteratorConcat,
  iteratorConcatNative,
  iteratorDrop,
  iteratorEvery,
  iteratorFilter,
  iteratorFind,
  iteratorForEach,
  iteratorFrom,
  iteratorFromNative,
  iteratorMap,
  iteratorMapNative,
  iteratorReduce,
  iteratorSome,
  iteratorTake,
  iteratorToArray,
} from '../../../src/polyfills/iterator/index.mjs'
import {
  iteratorEveryShim,
  iteratorFindShim,
  iteratorForEachShim,
  iteratorReduceShim,
  iteratorSomeShim,
  iteratorToArrayShim,
} from '../../../src/polyfills/iterator/eager.mjs'
import {
  iteratorDropShim,
  iteratorFilterShim,
  iteratorFlatMapShim,
  iteratorMapShim,
  iteratorTakeShim,
  limitOf,
} from '../../../src/polyfills/iterator/lazy.mjs'
import { iteratorHelperPrototype } from '../../../src/polyfills/iterator/shared.mjs'
import {
  iteratorConcatShim,
  iteratorFromShim,
} from '../../../src/polyfills/iterator/statics.mjs'

/**
 * A fresh iterator over `values`, built by hand so nothing about it depends on
 * the engine's own helpers.
 */
function iterOf<T>(values: readonly T[]): Iterator<T> & { closed: boolean } {
  let index = 0
  return {
    closed: false,
    next(): IteratorResult<T> {
      return index < values.length
        ? { done: false, value: values[index++]! }
        : { done: true, value: undefined }
    },
    return(): IteratorResult<T> {
      this.closed = true
      return { done: true, value: undefined }
    },
  }
}

/**
 * Drain a helper into an array through its own `next`.
 */
function drain<T>(helper: { next: () => IteratorResult<T> }): T[] {
  const out: T[] = []
  for (;;) {
    const result = helper.next()
    if (result.done) {
      return out
    }
    out.push(result.value)
  }
}

describe('limitOf', () => {
  it('accepts a numeric string and truncates', () => {
    expect(limitOf('3')).toBe(3)
    expect(limitOf(2.9)).toBe(2)
  })

  it('keeps Infinity', () => {
    expect(limitOf(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY)
  })

  it('rejects NaN with a RangeError, not a silent zero', () => {
    expect(() => limitOf(Number.NaN)).toThrow(RangeError)
    expect(() => limitOf(undefined)).toThrow(RangeError)
  })

  it('rejects a negative limit with a RangeError', () => {
    expect(() => limitOf(-1)).toThrow(RangeError)
  })
})

describe('the lazy helpers', () => {
  for (const [label, map, filter, take, drop] of [
    [
      'shim',
      iteratorMapShim,
      iteratorFilterShim,
      iteratorTakeShim,
      iteratorDropShim,
    ],
    ['selected', iteratorMap, iteratorFilter, iteratorTake, iteratorDrop],
  ] as const) {
    describe(label, () => {
      it('map transforms each value with its index', () => {
        const out = drain(
          map(iterOf([10, 20]), (v: number, i: number) => v + i),
        )
        expect(out).toEqual([10, 21])
      })

      it('filter keeps only matches', () => {
        expect(
          drain(filter(iterOf([1, 2, 3, 4]), (v: number) => v % 2 === 0)),
        ).toEqual([2, 4])
      })

      it('take stops after the limit', () => {
        expect(drain(take(iterOf([1, 2, 3]), 2))).toEqual([1, 2])
      })

      it('drop skips the first values', () => {
        expect(drain(drop(iterOf([1, 2, 3]), 2))).toEqual([3])
      })

      it('take closes the source when the limit runs out', () => {
        const source = iterOf([1, 2, 3])
        drain(take(source, 2))
        expect(source.closed).toBe(true)
      })

      it('drop consumes nothing until the first next', () => {
        // Building the helper must not touch the source: the skipping is
        // specified to happen on the first step.
        let nextCalls = 0
        const source = {
          next() {
            nextCalls += 1
            return { done: true, value: undefined }
          },
        }
        drop(source, 2)
        expect(nextCalls).toBe(0)
      })

      it('closes the source when the callback throws', () => {
        const source = iterOf([1, 2])
        const helper = map(source, () => {
          throw new Error('boom')
        })
        expect(() => helper.next()).toThrow('boom')
        expect(source.closed).toBe(true)
      })

      it('a bad argument closes the source before reading next', () => {
        // The source is handed over the moment the method is called, so the
        // validation failure still owes it a close - and `next` is never read.
        let closed = false
        const source = {
          get next() {
            throw new Error('next must not be read')
          },
          return() {
            closed = true
            return { done: true, value: undefined }
          },
        }
        expect(() => map(source, undefined as never)).toThrow(TypeError)
        expect(closed).toBe(true)
      })
    })
  }

  it('never reads a done result value', () => {
    // A done result may carry a throwing `value` getter, and the spec never
    // reaches it.
    const source = {
      next: () => ({
        done: true,
        get value(): never {
          throw new Error('value must not be read')
        },
      }),
    }
    const helper = iteratorMapShim(source, (v: unknown) => v)
    expect(helper.next().done).toBe(true)
  })

  it('flatMap flattens one level', () => {
    expect(
      drain(iteratorFlatMapShim(iterOf([1, 2]), (v: number) => [v, v * 10])),
    ).toEqual([1, 10, 2, 20])
  })

  it('flatMap rejects a string, which is iterable but not an object', () => {
    const helper = iteratorFlatMapShim(iterOf([1]), () => 'ab' as never)
    expect(() => helper.next()).toThrow(TypeError)
  })

  it('the result is an Iterator Helper, not a generator', () => {
    // test262 reads the prototype and the toStringTag, so a generator object
    // would be the wrong shape even with identical behavior.
    const helper = iteratorMapShim(iterOf([1]), (v: number) => v)
    const protoMatches =
      Object.getPrototypeOf(helper) === iteratorHelperPrototype
    expect(protoMatches).toBe(true)
    expect(Object.prototype.toString.call(helper)).toBe(
      '[object Iterator Helper]',
    )
  })

  it('next on a non-helper throws a TypeError', () => {
    const { next } = iteratorHelperPrototype as { next: () => unknown }
    expect(() => next.call({})).toThrow(TypeError)
  })

  it('prefers the native method when the engine has one', () => {
    const picked = iteratorMapNative ?? iteratorMapShim
    const selectedIsPicked = iteratorMap === picked
    expect(selectedIsPicked).toBe(true)
  })
})

describe('the eager helpers', () => {
  for (const [label, toArray, forEach, reduce, some, every, find] of [
    [
      'shim',
      iteratorToArrayShim,
      iteratorForEachShim,
      iteratorReduceShim,
      iteratorSomeShim,
      iteratorEveryShim,
      iteratorFindShim,
    ],
    [
      'selected',
      iteratorToArray,
      iteratorForEach,
      iteratorReduce,
      iteratorSome,
      iteratorEvery,
      iteratorFind,
    ],
  ] as const) {
    describe(label, () => {
      it('toArray collects every value', () => {
        expect(toArray(iterOf([1, 2, 3]))).toEqual([1, 2, 3])
      })

      it('forEach visits each value and returns undefined', () => {
        const seen: number[] = []
        expect(forEach(iterOf([1, 2]), (v: number) => seen.push(v))).toBe(
          undefined,
        )
        expect(seen).toEqual([1, 2])
      })

      it('reduce folds with an initial value', () => {
        expect(
          reduce(iterOf([1, 2, 3]), (a: number, b: number) => a + b, 10),
        ).toBe(16)
      })

      it('reduce uses the first value when given no initial', () => {
        expect(reduce(iterOf([1, 2, 3]), (a: number, b: number) => a + b)).toBe(
          6,
        )
      })

      it('reduce on an empty iterator with no initial throws a TypeError', () => {
        expect(() =>
          reduce(iterOf([] as number[]), (a: number, b: number) => a + b),
        ).toThrow(TypeError)
      })

      it('some stops and closes on the first match', () => {
        const source = iterOf([1, 2, 3])
        expect(some(source, (v: number) => v === 2)).toBe(true)
        expect(source.closed).toBe(true)
      })

      it('every stops and closes on the first miss', () => {
        const source = iterOf([1, 2, 3])
        expect(every(source, (v: number) => v === 1)).toBe(false)
        expect(source.closed).toBe(true)
      })

      it('find returns the match and closes', () => {
        const source = iterOf([1, 2, 3])
        expect(find(source, (v: number) => v > 1)).toBe(2)
        expect(source.closed).toBe(true)
      })

      it('find returns undefined when nothing matches', () => {
        expect(find(iterOf([1, 2]), () => false)).toBe(undefined)
      })
    })
  }
})

describe('the statics', () => {
  it('from wraps a plain iterator', () => {
    expect(drain(iteratorFromShim(iterOf([1, 2])))).toEqual([1, 2])
  })

  it('from returns a generator untouched', () => {
    // A generator already inherits from %IteratorPrototype%, so wrapping it
    // would change its toStringTag.
    function* gen() {
      yield 1
    }
    const generator = gen()
    const sameObject = iteratorFromShim(generator) === generator
    expect(sameObject).toBe(true)
  })

  it('from walks a string', () => {
    expect(drain(iteratorFromShim('abc'))).toEqual(['a', 'b', 'c'])
  })

  it('from rejects a non-string primitive', () => {
    expect(() => iteratorFromShim(5)).toThrow(TypeError)
    expect(() => iteratorFromShim(undefined)).toThrow(TypeError)
  })

  it("from's wrapper forwards the source's return result verbatim", () => {
    // The wrapper is NOT an iterator helper: it hands back exactly what the
    // source returned rather than reporting its own done state.
    const sentinel = { done: true, value: 5 }
    const wrapper = iteratorFromShim({
      next: () => ({ done: false, value: 1 }),
      return: () => sentinel,
    }) as unknown as { return: () => unknown }
    const sameResult = wrapper.return() === sentinel
    expect(sameResult).toBe(true)
  })

  it('concat walks each iterable in order', () => {
    expect(drain(iteratorConcatShim([1, 2], [3]))).toEqual([1, 2, 3])
  })

  it('concat validates every argument before walking any', () => {
    // A bad third argument throws before the first is touched.
    let walked = false
    const first = {
      [Symbol.iterator]: () => {
        walked = true
        return iterOf([1])
      },
    }
    expect(() => iteratorConcatShim(first, 5 as never)).toThrow(TypeError)
    expect(walked).toBe(false)
  })

  it('concat with no arguments is empty', () => {
    expect(drain(iteratorConcatShim())).toEqual([])
  })

  it('prefers the native statics when the engine has them', () => {
    const fromPicked = iteratorFromNative ?? iteratorFromShim
    const concatPicked = iteratorConcatNative ?? iteratorConcatShim
    const bothSelected =
      iteratorFrom === fromPicked && iteratorConcat === concatPicked
    expect(bothSelected).toBe(true)
  })
})
