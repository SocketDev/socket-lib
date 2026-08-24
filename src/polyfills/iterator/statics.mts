/**
 * @file `Iterator.from` (Node 22) and `Iterator.concat` (Node 26).
 *   `Iterator.from` has one job worth spelling out: an object that is ALREADY
 *   an iterator inheriting from `%IteratorPrototype%` is returned untouched,
 *   and anything else is wrapped. Wrapping something already wrapped would be
 *   observable, because the wrapper forwards `return` and the original would
 *   receive it twice.
 */

import { TypeErrorCtor } from '../../primordials/error.mjs'
import { WeakMapCtor } from '../../primordials/map-set.mjs'
import {
  ObjectCreate,
  ObjectCtor,
  ObjectDefineProperty,
  ObjectGetPrototypeOf,
} from '../../primordials/object.mjs'
import { ReflectApply, ReflectGet } from '../../primordials/reflect.mjs'
import { SymbolIterator } from '../../primordials/symbol.mjs'
import {
  doneResult,
  iteratorPrototypeOf,
  iteratorRecordOf,
  makeIteratorHelper,
} from './shared.mts'

import type { IteratorRecord, StepResult } from './shared.mts'

/**
 * A wrapper's source, with `next` captured at wrap time.
 *
 * `next` is read ONCE, when `Iterator.from` runs; `return` is looked up on
 * every call. test262 checks both halves of that asymmetry.
 */
export interface WrappedSource {
  iterator: object
  next: unknown
}

const wrapperTargets = new WeakMapCtor<object, WrappedSource>()

/**
 * True when `value` already inherits from `%IteratorPrototype%`, so
 * `Iterator.from` hands it back rather than wrapping it.
 */
export function inheritsFromIteratorPrototype(value: unknown): boolean {
  if (value === null || typeof value !== 'object') {
    return false
  }
  const iteratorPrototype = iteratorPrototypeOf()
  let proto: object | null = ObjectGetPrototypeOf(value)
  // Bounded so a cyclic prototype chain cannot hang the walk.
  for (let i = 0; i < 100; i += 1) {
    if (proto === null) {
      return false
    }
    if (proto === iteratorPrototype) {
      return true
    }
    proto = ObjectGetPrototypeOf(proto)
  }
  return false
}

/**
 * `Iterator.concat` shim.
 *
 * Every argument is validated up front - each must be an object with a
 * callable `Symbol.iterator` - so a bad third argument throws before the first
 * one is walked.
 */
export function iteratorConcatShim<T>(
  ...sources: readonly unknown[]
): IteratorObject<T> {
  const methods: Array<{ method: Function; source: object }> = []
  for (let i = 0, { length } = sources; i < length; i += 1) {
    const source = sources[i]
    if (source === null || typeof source !== 'object') {
      throw new TypeErrorCtor('Each argument must be an object')
    }
    const method = ReflectGet(source, SymbolIterator)
    if (typeof method !== 'function') {
      throw new TypeErrorCtor(
        'Each argument must have a callable Symbol.iterator',
      )
    }
    methods.push({ method, source })
  }
  let index = 0
  let current: IteratorRecord<T> | undefined
  return makeIteratorHelper<T>({
    close: () => {
      if (current) {
        current.close()
      }
    },
    done: false,
    running: false,
    step: (): StepResult<T> => {
      for (;;) {
        if (current) {
          const result = current.next()
          if (!result.done) {
            return { done: false, value: result.value as T }
          }
          current = undefined
        }
        if (index >= methods.length) {
          return doneResult()
        }
        const entry = methods[index]!
        index += 1
        const iterator = ReflectApply(entry.method, entry.source, [])
        if (iterator === null || typeof iterator !== 'object') {
          throw new TypeErrorCtor('Symbol.iterator must return an object')
        }
        current = iteratorRecordOf<T>(iterator)
      }
    },
  })
}

/**
 * `Iterator.from` shim.
 */
export function iteratorFromShim<T>(source: unknown): IteratorObject<T> {
  const record = recordFromIterableOrIterator<T>(source)
  // The test is against the RESOLVED iterator, not the argument. A generator
  // has its own `Symbol.iterator` returning itself, so checking the argument
  // wrongly wrapped it and changed its toStringTag from Generator.
  if (inheritsFromIteratorPrototype(record.iterator)) {
    return record.iterator as IteratorObject<T>
  }
  const wrapper = ObjectCreate(wrapForValidIteratorPrototype)
  wrapperTargets.set(wrapper, {
    iterator: record.iterator,
    next: record.nextMethod,
  })
  return wrapper as IteratorObject<T>
}

/**
 * The iterator record for an iterable OR an iterator.
 *
 * A string is accepted here, unlike in `flatMap`: `Iterator.from('ab')` is
 * specified to walk its code points.
 */
export function recordFromIterableOrIterator<T>(
  source: unknown,
): IteratorRecord<T> {
  if (source === null || source === undefined) {
    throw new TypeErrorCtor('The argument must not be null or undefined')
  }
  if (typeof source !== 'object' && typeof source !== 'string') {
    throw new TypeErrorCtor('The argument must be an object or a string')
  }
  // Boxed as the lookup TARGET but the primitive stays the RECEIVER, which is
  // what GetV does. A `Symbol.iterator` getter on String.prototype therefore
  // sees a primitive `this` for `Iterator.from('')` and an object for
  // `Iterator.from(new String(''))`, and test262 checks both.
  const method = ReflectGet(ObjectCtor(source), SymbolIterator, source)
  if (method === undefined || method === null) {
    if (typeof source !== 'object') {
      // A string reaches here only if `Symbol.iterator` was removed from
      // String.prototype, and a string is not an iterator on its own.
      throw new TypeErrorCtor('A non-iterable argument must be an object')
    }
    return iteratorRecordOf<T>(source)
  }
  if (typeof method !== 'function') {
    throw new TypeErrorCtor('Symbol.iterator must be callable')
  }
  const iterator = ReflectApply(method, source, [])
  if (iterator === null || typeof iterator !== 'object') {
    throw new TypeErrorCtor('Symbol.iterator must return an object')
  }
  return iteratorRecordOf<T>(iterator)
}

/**
 * `%WrapForValidIteratorPrototype%`.
 *
 * Distinct from the iterator-helper prototype because its methods FORWARD
 * results rather than normalize them: `wrapper.next()` hands back exactly the
 * object the source returned, and `wrapper.return()` hands back exactly what
 * the source's `return` returned. A helper cannot do that - it has to report
 * its own done state - which is why `Iterator.from` gets its own shape.
 */
export const wrapForValidIteratorPrototype: object = ObjectCreate(
  iteratorPrototypeOf(),
)

/**
 * The wrapped source for a wrapper object, or a TypeError.
 */
export function wrappedTargetOf(receiver: unknown): WrappedSource {
  if (receiver === null || typeof receiver !== 'object') {
    throw new TypeErrorCtor('The receiver must be a wrapped iterator')
  }
  const target = wrapperTargets.get(receiver)
  if (target === undefined) {
    throw new TypeErrorCtor('The receiver must be a wrapped iterator')
  }
  return target
}

ObjectDefineProperty(wrapForValidIteratorPrototype, 'next', {
  configurable: true,
  enumerable: false,
  value: {
    next(this: unknown): unknown {
      const { iterator, next } = wrappedTargetOf(this)
      if (typeof next !== 'function') {
        throw new TypeErrorCtor('The wrapped iterator has no callable next')
      }
      return ReflectApply(next, iterator, [])
    },
  }.next,
  writable: true,
})

ObjectDefineProperty(wrapForValidIteratorPrototype, 'return', {
  configurable: true,
  enumerable: false,
  value: {
    return(this: unknown): unknown {
      const { iterator } = wrappedTargetOf(this)
      const ret = ReflectGet(iterator, 'return')
      if (ret === undefined || ret === null) {
        return { done: true, value: undefined }
      }
      if (typeof ret !== 'function') {
        throw new TypeErrorCtor(
          'The wrapped iterator has a non-callable return',
        )
      }
      return ReflectApply(ret, iterator, [])
    },
  }.return,
  writable: true,
})
