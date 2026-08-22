/**
 * @file The five iterator helpers that return another iterator.
 *   The step order is fixed and observable, and it is not the order that reads
 *   naturally:
 *
 *   1. The receiver must be an object.
 *   2. The argument is validated or coerced - and a FAILURE here still closes the
 *      receiver, because the source was handed over the moment the method was
 *      called.
 *   3. Only then is `next` read. So `iter.map()` with no argument closes `iter`
 *      and throws without ever reading `iter.next`, and a `take` limit whose
 *      `valueOf` throws closes it too. A callback that throws mid-iteration
 *      closes the source QUIETLY: if the source's `return` also throws, the
 *      callback's error is the one that escapes.
 */

import { RangeErrorCtor, TypeErrorCtor } from '../../primordials/error.mjs'
import { MathTrunc } from '../../primordials/math.mjs'
import { NumberCtor, NumberIsNaN } from '../../primordials/number.mjs'
import { ReflectApply, ReflectGet } from '../../primordials/reflect.mjs'
import { SymbolIterator } from '../../primordials/symbol.mjs'
import {
  assertObjectReceiver,
  closeOnThrow,
  closeThenThrow,
  doneResult,
  iteratorRecordOf,
  makeIteratorHelper,
} from './shared.mts'

import type { IteratorRecord, StepResult } from './shared.mts'

/**
 * Turn a `flatMap` callback result into an iterator record.
 *
 * A string is rejected on purpose: it is iterable, and flattening it character
 * by character is the mistake the spec forbids by requiring an object.
 */
export function innerRecordOf<U>(mapped: unknown): IteratorRecord<U> {
  if (mapped === null || typeof mapped !== 'object') {
    throw new TypeErrorCtor('The mapped value must be an object')
  }
  const method = ReflectGet(mapped, SymbolIterator)
  if (method === undefined || method === null) {
    return iteratorRecordOf<U>(mapped)
  }
  if (typeof method !== 'function') {
    throw new TypeErrorCtor('Symbol.iterator must be callable')
  }
  const inner = ReflectApply(method, mapped, [])
  if (inner === null || typeof inner !== 'object') {
    throw new TypeErrorCtor('Symbol.iterator must return an object')
  }
  return iteratorRecordOf<U>(inner)
}

/**
 * `Iterator.prototype.drop` shim. The skipping happens on the first `next`, not
 * at construction, so building the helper consumes nothing.
 */
export function iteratorDropShim<T>(
  receiver: unknown,
  limit: unknown,
): IteratorObject<T> {
  const self = assertObjectReceiver(receiver)
  let left = closeOnThrow(self, () => limitOf(limit))
  const source = iteratorRecordOf<T>(self)
  return makeIteratorHelper<T>({
    close: source.close,
    done: false,
    running: false,
    step: () => {
      while (left > 0) {
        if (left !== Infinity) {
          left -= 1
        }
        const skipped = source.next()
        if (skipped.done) {
          return doneResult()
        }
      }
      const result = source.next()
      if (result.done) {
        return doneResult()
      }
      return { done: false, value: result.value as T }
    },
  })
}

/**
 * `Iterator.prototype.filter` shim.
 */
export function iteratorFilterShim<T>(
  receiver: unknown,
  predicate: (value: T, index: number) => unknown,
): IteratorObject<T> {
  const self = assertObjectReceiver(receiver)
  if (typeof predicate !== 'function') {
    closeThenThrow(self, 'The predicate must be a function')
  }
  const source = iteratorRecordOf<T>(self)
  let index = 0
  return makeIteratorHelper<T>({
    close: source.close,
    done: false,
    running: false,
    step: () => {
      for (;;) {
        const result = source.next()
        if (result.done) {
          return doneResult()
        }
        const value = result.value as T
        const at = index
        index += 1
        let keep
        try {
          keep = predicate(value, at)
        } catch (e) {
          source.closeQuietly()
          throw e
        }
        if (keep) {
          return { done: false, value }
        }
      }
    },
  })
}

/**
 * `Iterator.prototype.flatMap` shim.
 */
export function iteratorFlatMapShim<T, U>(
  receiver: unknown,
  mapper: (value: T, index: number) => Iterable<U> | Iterator<U>,
): IteratorObject<U> {
  const self = assertObjectReceiver(receiver)
  if (typeof mapper !== 'function') {
    closeThenThrow(self, 'The mapper must be a function')
  }
  const source = iteratorRecordOf<T>(self)
  let index = 0
  let inner: IteratorRecord<U> | undefined
  return makeIteratorHelper<U>({
    close: () => {
      if (inner) {
        inner.closeQuietly()
      }
      source.close()
    },
    done: false,
    running: false,
    step: (): StepResult<U> => {
      for (;;) {
        if (inner) {
          let innerResult
          try {
            innerResult = inner.next()
          } catch (e) {
            inner = undefined
            source.closeQuietly()
            throw e
          }
          if (!innerResult.done) {
            return { done: false, value: innerResult.value as U }
          }
          inner = undefined
        }
        const outer = source.next()
        if (outer.done) {
          return doneResult()
        }
        const at = index
        index += 1
        try {
          inner = innerRecordOf<U>(mapper(outer.value as T, at))
        } catch (e) {
          source.closeQuietly()
          throw e
        }
      }
    },
  })
}

/**
 * `Iterator.prototype.map` shim.
 */
export function iteratorMapShim<T, U>(
  receiver: unknown,
  mapper: (value: T, index: number) => U,
): IteratorObject<U> {
  const self = assertObjectReceiver(receiver)
  if (typeof mapper !== 'function') {
    closeThenThrow(self, 'The mapper must be a function')
  }
  const source = iteratorRecordOf<T>(self)
  let index = 0
  return makeIteratorHelper<U>({
    close: source.close,
    done: false,
    running: false,
    step: () => {
      const result = source.next()
      if (result.done) {
        return doneResult()
      }
      const at = index
      index += 1
      try {
        return { done: false, value: mapper(result.value as T, at) }
      } catch (e) {
        source.closeQuietly()
        throw e
      }
    },
  })
}

/**
 * `Iterator.prototype.take` shim. Closes the source as soon as the count runs
 * out, rather than waiting to be asked again.
 */
export function iteratorTakeShim<T>(
  receiver: unknown,
  limit: unknown,
): IteratorObject<T> {
  const self = assertObjectReceiver(receiver)
  let left = closeOnThrow(self, () => limitOf(limit))
  const source = iteratorRecordOf<T>(self)
  return makeIteratorHelper<T>({
    close: source.close,
    done: false,
    running: false,
    step: () => {
      if (left === 0) {
        source.close()
        return doneResult()
      }
      if (left !== Infinity) {
        left -= 1
      }
      const result = source.next()
      if (result.done) {
        return doneResult()
      }
      return { done: false, value: result.value as T }
    },
  })
}

/**
 * The spec's limit coercion for `take` and `drop`.
 *
 * ToNumber first, so a numeric string works; NaN is a RangeError rather than a
 * silent zero, and so is a negative limit. Infinity is preserved.
 */
export function limitOf(value: unknown): number {
  const numeric = NumberCtor(value)
  if (NumberIsNaN(numeric)) {
    throw new RangeErrorCtor('The limit must not be NaN')
  }
  const integer =
    numeric === Infinity || numeric === -Infinity ? numeric : MathTrunc(numeric)
  if (integer < 0) {
    throw new RangeErrorCtor('The limit must not be negative')
  }
  return integer
}
