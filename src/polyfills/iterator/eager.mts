/**
 * @file The six iterator helpers that consume the iterator and return a value.
 *   Same step order as the lazy helpers: the receiver must be an object, then
 *   the callback is validated - and a bad callback closes the receiver before
 *   throwing - and only then is `next` read.
 *   Two kinds of early exit, closed differently. A callback that THREW closes
 *   quietly, so a throwing `return` cannot mask it. A short-circuit that
 *   succeeded (`some` found a match, `find` found its value) closes normally,
 *   letting a throwing `return` propagate.
 */

import { TypeErrorCtor } from '../../primordials/error.mjs'
import {
  assertObjectReceiver,
  closeThenThrow,
  iteratorRecordOf,
} from './shared.mts'

/**
 * `Iterator.prototype.every` shim. Closes the source on the first miss.
 */
export function iteratorEveryShim<T>(
  receiver: unknown,
  predicate: (value: T, index: number) => unknown,
): boolean {
  const self = assertObjectReceiver(receiver)
  if (typeof predicate !== 'function') {
    closeThenThrow(self, 'The predicate must be a function')
  }
  const source = iteratorRecordOf<T>(self)
  let index = 0
  for (;;) {
    const result = source.next()
    if (result.done) {
      return true
    }
    let hit
    try {
      hit = predicate(result.value as T, index)
    } catch (e) {
      source.closeQuietly()
      throw e
    }
    if (!hit) {
      source.close()
      return false
    }
    index += 1
  }
}

/**
 * `Iterator.prototype.find` shim. Closes the source on the first match.
 */
export function iteratorFindShim<T>(
  receiver: unknown,
  predicate: (value: T, index: number) => unknown,
): T | undefined {
  const self = assertObjectReceiver(receiver)
  if (typeof predicate !== 'function') {
    closeThenThrow(self, 'The predicate must be a function')
  }
  const source = iteratorRecordOf<T>(self)
  let index = 0
  for (;;) {
    const result = source.next()
    if (result.done) {
      return undefined
    }
    const value = result.value as T
    let hit
    try {
      hit = predicate(value, index)
    } catch (e) {
      source.closeQuietly()
      throw e
    }
    if (hit) {
      source.close()
      return value
    }
    index += 1
  }
}

/**
 * `Iterator.prototype.forEach` shim.
 */
export function iteratorForEachShim<T>(
  receiver: unknown,
  visit: (value: T, index: number) => void,
): undefined {
  const self = assertObjectReceiver(receiver)
  if (typeof visit !== 'function') {
    closeThenThrow(self, 'The callback must be a function')
  }
  const source = iteratorRecordOf<T>(self)
  let index = 0
  for (;;) {
    const result = source.next()
    if (result.done) {
      return undefined
    }
    try {
      visit(result.value as T, index)
    } catch (e) {
      source.closeQuietly()
      throw e
    }
    index += 1
  }
}

/**
 * `Iterator.prototype.reduce` shim.
 *
 * With no initial value the first element becomes the accumulator, and an
 * EMPTY iterator is a TypeError rather than undefined - the same rule
 * `Array.prototype.reduce` follows.
 */
export function iteratorReduceShim<T, A>(
  receiver: unknown,
  reducer: (accumulator: A, value: T, index: number) => A,
  ...initial: [A] | []
): A {
  const self = assertObjectReceiver(receiver)
  if (typeof reducer !== 'function') {
    closeThenThrow(self, 'The reducer must be a function')
  }
  const source = iteratorRecordOf<T>(self)
  let accumulator: A
  let index = 0
  if (initial.length === 0) {
    const first = source.next()
    if (first.done) {
      throw new TypeErrorCtor(
        'Reduce of an empty iterator with no initial value',
      )
    }
    accumulator = first.value as unknown as A
    index = 1
  } else {
    accumulator = initial[0]
  }
  for (;;) {
    const result = source.next()
    if (result.done) {
      return accumulator
    }
    try {
      accumulator = reducer(accumulator, result.value as T, index)
    } catch (e) {
      source.closeQuietly()
      throw e
    }
    index += 1
  }
}

/**
 * `Iterator.prototype.some` shim. Closes the source on the first match.
 */
export function iteratorSomeShim<T>(
  receiver: unknown,
  predicate: (value: T, index: number) => unknown,
): boolean {
  const self = assertObjectReceiver(receiver)
  if (typeof predicate !== 'function') {
    closeThenThrow(self, 'The predicate must be a function')
  }
  const source = iteratorRecordOf<T>(self)
  let index = 0
  for (;;) {
    const result = source.next()
    if (result.done) {
      return false
    }
    let hit
    try {
      hit = predicate(result.value as T, index)
    } catch (e) {
      source.closeQuietly()
      throw e
    }
    if (hit) {
      source.close()
      return true
    }
    index += 1
  }
}

/**
 * `Iterator.prototype.toArray` shim.
 */
export function iteratorToArrayShim<T>(receiver: unknown): T[] {
  const self = assertObjectReceiver(receiver)
  const source = iteratorRecordOf<T>(self)
  const out: T[] = []
  for (;;) {
    const result = source.next()
    if (result.done) {
      return out
    }
    out.push(result.value as T)
  }
}
