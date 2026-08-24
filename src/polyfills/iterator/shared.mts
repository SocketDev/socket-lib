/**
 * @file The machinery every iterator helper is built on.
 *   Five things here are not obvious and are all observable.
 *   A helper's result is not a generator. It is an object whose [[Prototype]]
 *   is `%IteratorHelperPrototype%`, carrying `next`, `return`, and a
 *   `Symbol.toStringTag` of `'Iterator Helper'`, and test262 reads all three.
 *   The brand check is a WeakMap rather than a property, because
 *   `next.call({})` has to throw a TypeError and a property any object could
 *   carry would not.
 *   A DONE result's `value` is never read. `{ done: true, get value() { throw }
 *   }` is a legal result, and reading it eagerly turns a clean finish into an
 *   exception.
 *   The source's `next` is read once but its callability is checked at CALL
 *   time. `map.call({ next: 0 }, fn)` builds a helper without complaint and
 *   throws only when that helper is stepped.
 *   Closing comes in two flavors, which is why there are two functions rather
 *   than a flag. When an error is already pending, a throwing `return` is
 *   swallowed so the original error wins. On a clean early exit, it propagates.
 */

import { ArrayPrototypeValues } from '../../primordials/array.mjs'
import { TypeErrorCtor } from '../../primordials/error.mjs'
import { WeakMapCtor } from '../../primordials/map-set.mjs'
import {
  ObjectCreate,
  ObjectDefineProperty,
  ObjectGetPrototypeOf,
} from '../../primordials/object.mjs'
import { ReflectApply, ReflectGet } from '../../primordials/reflect.mjs'
import { SymbolToStringTag } from '../../primordials/symbol.mjs'

/**
 * A step function's outcome, in the shape `next` returns.
 */
export interface StepResult<T> {
  done: boolean
  value: T | undefined
}

/**
 * One helper's mutable state.
 */
export interface HelperState<T> {
  /**
   * Close the underlying source, letting its errors escape.
   */
  close: () => void
  /**
   * True once the helper has finished or been closed.
   */
  done: boolean
  /**
   * True while `step` is on the stack, to reject a re-entrant `next`.
   */
  running: boolean
  /**
   * Produce the next result, or a done result when exhausted.
   */
  step: () => StepResult<T>
}

/**
 * A source iterator reduced to what a helper uses.
 */
export interface IteratorRecord<T> {
  /**
   * Close it, letting a throwing `return` escape.
   */
  close: () => void
  /**
   * Close it, swallowing a throwing `return`.
   */
  closeQuietly: () => void
  /**
   * The iterator object itself. `Iterator.from` needs it: an iterator that
   * already inherits from `%IteratorPrototype%` is returned unwrapped, and
   * that test is against THIS object rather than whatever was passed in.
   */
  iterator: object
  /**
   * Step it once.
   */
  next: () => StepResult<T>
  /**
   * The `next` property as read at construction, exposed so a caller that
   * forwards raw results does not have to read it a SECOND time - test262
   * counts the property gets.
   */
  nextMethod: unknown
}

const helperStates = new WeakMapCtor<object, HelperState<unknown>>()

/**
 * Throw unless `receiver` is an object, which every helper checks FIRST -
 * before coercing an argument and before reading `next`.
 */
export function assertObjectReceiver(receiver: unknown): object {
  if (receiver === null || typeof receiver !== 'object') {
    throw new TypeErrorCtor('The receiver must be an object')
  }
  return receiver
}

/**
 * Call `iterator.return` if it has one, letting a throw from that call escape.
 * For a clean early exit: a limit reached, a match found, a caller's `return`.
 */
export function closeIterator(iterator: object): void {
  const ret = ReflectGet(iterator, 'return')
  if (typeof ret === 'function') {
    ReflectApply(ret, iterator, [])
  }
}

/**
 * Call `iterator.return` if it has one, swallowing a throw from that call.
 * For when an error is already pending, which must be the one the caller sees.
 */
export function closeIteratorQuietly(iterator: object): void {
  const ret = ReflectGet(iterator, 'return')
  if (typeof ret !== 'function') {
    return
  }
  try {
    ReflectApply(ret, iterator, [])
  } catch {
    // The pending error is the one the caller must see.
  }
}

/**
 * Run `coerce`, closing `receiver` and rethrowing if it throws. Used for the
 * `take`/`drop` limit, whose coercion may run user code.
 */
export function closeOnThrow<T>(receiver: object, coerce: () => T): T {
  try {
    return coerce()
  } catch (e) {
    closeIteratorQuietly(receiver)
    throw e
  }
}

/**
 * Throw a TypeError after closing `receiver`, which is what argument
 * validation does: a bad callback still owes the source its `return` call.
 */
export function closeThenThrow(receiver: object, message: string): never {
  closeIteratorQuietly(receiver)
  throw new TypeErrorCtor(message)
}

/**
 * A done result, allocated fresh each time because a caller may mutate it.
 */
export function doneResult(): StepResult<never> {
  return { done: true, value: undefined }
}

/**
 * The shared `%IteratorHelperPrototype%`.
 */
export const iteratorHelperPrototype: object = ObjectCreate(
  iteratorPrototypeOf(),
)

/**
 * `%IteratorPrototype%`.
 */
export function iteratorPrototypeOf(): object {
  // Derived from an array iterator rather than read off a global: `Iterator`
  // does not exist below Node 22, and `%IteratorPrototype%` is its grandparent
  // either way.
  const arrayIterator = ArrayPrototypeValues([])
  const arrayIteratorPrototype = ObjectGetPrototypeOf(arrayIterator)
  return ObjectGetPrototypeOf(arrayIteratorPrototype) as object
}

/**
 * Wrap an iterator object, reading `next` a single time.
 *
 * `next` is NOT checked for callability here: the spec's GetIteratorDirect only
 * reads the property, and a non-callable one throws when the helper is stepped.
 */
export function iteratorRecordOf<T>(iterator: object): IteratorRecord<T> {
  const next = ReflectGet(iterator, 'next')
  return {
    close: () => closeIterator(iterator),
    closeQuietly: () => closeIteratorQuietly(iterator),
    iterator,
    nextMethod: next,
    next: () => {
      if (typeof next !== 'function') {
        throw new TypeErrorCtor('The iterator must have a callable next')
      }
      const result = ReflectApply(next, iterator, [])
      if (result === null || typeof result !== 'object') {
        throw new TypeErrorCtor('The iterator result must be an object')
      }
      if (ReflectGet(result, 'done')) {
        // `value` is deliberately not read: a done result may carry a throwing
        // `value` getter, and the spec never reaches it.
        return doneResult()
      }
      return { done: false, value: ReflectGet(result, 'value') as T }
    },
  }
}

/**
 * Build a helper object over `state`.
 */
export function makeIteratorHelper<T>(
  state: HelperState<T>,
): IteratorObject<T> {
  const helper = ObjectCreate(iteratorHelperPrototype)
  helperStates.set(helper, state as HelperState<unknown>)
  return helper as IteratorObject<T>
}

/**
 * Read a helper's state, throwing when the receiver is not a helper.
 */
export function stateOf<T>(receiver: unknown): HelperState<T> {
  if (receiver === null || typeof receiver !== 'object') {
    throw new TypeErrorCtor('The receiver must be an Iterator Helper')
  }
  const state = helperStates.get(receiver)
  if (state === undefined) {
    throw new TypeErrorCtor('The receiver must be an Iterator Helper')
  }
  return state as HelperState<T>
}

ObjectDefineProperty(iteratorHelperPrototype, 'next', {
  configurable: true,
  enumerable: false,
  value: {
    next(this: unknown): StepResult<unknown> {
      const state = stateOf(this)
      if (state.running) {
        throw new TypeErrorCtor('The iterator helper is already running')
      }
      if (state.done) {
        return doneResult()
      }
      state.running = true
      try {
        const result = state.step()
        if (result.done) {
          state.done = true
        }
        return result
      } catch (e) {
        // A throw finishes the helper: a later `next` reports done rather than
        // re-entering a source the spec has already abandoned.
        state.done = true
        throw e
      } finally {
        state.running = false
      }
    },
  }.next,
  writable: true,
})

ObjectDefineProperty(iteratorHelperPrototype, 'return', {
  configurable: true,
  enumerable: false,
  value: {
    return(this: unknown): StepResult<unknown> {
      const state = stateOf(this)
      if (state.running) {
        throw new TypeErrorCtor('The iterator helper is already running')
      }
      if (!state.done) {
        state.done = true
        // Marked running across the close: the source's `return` may call back
        // into this helper, and a re-entrant call has to throw rather than
        // quietly report done.
        state.running = true
        try {
          state.close()
        } finally {
          state.running = false
        }
      }
      return doneResult()
    },
  }.return,
  writable: true,
})

ObjectDefineProperty(iteratorHelperPrototype, SymbolToStringTag, {
  configurable: true,
  enumerable: false,
  value: 'Iterator Helper',
  writable: false,
})
