/**
 * @file Shims for the seven ES2025 `Set` methods, all Node 22.
 *   These take a "set-like" argument rather than only a real `Set`: anything
 *   with a numeric `size`, a callable `has`, and a callable `keys`. That is the
 *   part a naive implementation gets wrong, and it is observable in four ways a
 *   caller can see:
 *
 *   - WHICH of the two `has` methods runs. Every method except `union` picks a
 *     side by comparing sizes, so a set-like with a counting `has` can tell.
 *   - WHAT throws and when. `size` is read first, then `has`, then `keys`, so a
 *     set-like whose `size` getter throws never reaches the `has` lookup.
 *   - The ORDER of the result, which is insertion order and differs per method.
 *   - Whether the set-like's iterator is CLOSED. A method that stops early has to
 *     call the iterator's `return`. The spec's GetSetRecord abstraction is not
 *     modeled as such. Only its observable consequences are, which is what
 *     `test/test262-config` checks. Every touch of the receiver goes through a
 *     PRIMORDIAL rather than a method call, for three more reasons a caller can
 *     observe: a patched `Set.prototype.add` must not run while the result is
 *     built, a subclass's overrides must not run either, and a receiver that is
 *     not a real `Set` has to throw - which an uncurried primordial does on its
 *     own.
 */

import { RangeErrorCtor, TypeErrorCtor } from '../primordials/error.mjs'
import {
  SetCtor,
  SetPrototypeAdd,
  SetPrototypeDelete,
  SetPrototypeHas,
  SetPrototypeSizeGetter,
  SetPrototypeValues,
} from '../primordials/map-set.mjs'
import { MathTrunc } from '../primordials/math.mjs'
import {
  NumberCtor,
  NumberIsFinite,
  NumberIsNaN,
} from '../primordials/number.mjs'
import { ReflectApply, ReflectGet } from '../primordials/reflect.mjs'

/**
 * Call an iterator's `return` if it has one, per IteratorClose.
 *
 * A method that stops before the iterator is exhausted owes it this call, and
 * test262 checks that the count matches.
 */
export function closeIterator(iterator: unknown): void {
  if (iterator === null || typeof iterator !== 'object') {
    return
  }
  const ret = ReflectGet(iterator, 'return')
  if (typeof ret === 'function') {
    ReflectApply(ret, iterator, [])
  }
}

/**
 * The native `Set.prototype.<name>` returning a set, or undefined below Node
 * 22. Read off the prototype at module load, so a later patch of the global
 * cannot change what this module hands out.
 */
export function nativeSetCombine(name: string): SetCombineFn | undefined {
  const method = ReflectGet(SetCtor.prototype, name)
  if (typeof method !== 'function') {
    return undefined
  }
  return <T,>(set: ReadonlySet<T>, other: SetLike<T>) =>
    ReflectApply(method, set, [other]) as Set<T>
}

/**
 * The native `Set.prototype.<name>` returning a boolean, or undefined below
 * Node 22.
 */
export function nativeSetPredicate(name: string): SetPredicateFn | undefined {
  const method = ReflectGet(SetCtor.prototype, name)
  if (typeof method !== 'function') {
    return undefined
  }
  return <T,>(set: ReadonlySet<T>, other: SetLike<T>) =>
    Boolean(ReflectApply(method, set, [other]))
}

/**
 * A step function over `iterator`, with `next` read ONCE.
 *
 * Reading `next` on every turn of the loop is observable: test262 records the
 * property gets, and the spec's GetIteratorDirect looks it up a single time.
 */
export function nextOf<T>(iterator: unknown): () => IteratorResult<T> {
  const next = ReflectGet(iterator as object, 'next')
  if (typeof next !== 'function') {
    throw new TypeErrorCtor('The keys iterator must have a callable next')
  }
  return () => ReflectApply(next, iterator, []) as IteratorResult<T>
}

/**
 * The set-like's keys as an array, draining its iterator.
 */
export function recordKeysOf<T>(record: SetRecord<T>): T[] {
  const iterator = record.keys()
  const step = nextOf<T>(iterator)
  const out: T[] = []
  for (;;) {
    const result = step()
    if (result.done) {
      return out
    }
    out.push(result.value)
  }
}

/**
 * `Set.prototype.difference` shim. The receiver's elements that `other` lacks,
 * in the receiver's order.
 */
export function setDifferenceShim<T>(
  set: ReadonlySet<T>,
  other: SetLike<T>,
): Set<T> {
  const record = setRecordOf<T>(other)
  const values = setValuesOf(set)
  const out = new SetCtor<T>()
  for (let i = 0, { length } = values; i < length; i += 1) {
    SetPrototypeAdd(out, values[i]!)
  }
  if (values.length <= record.size) {
    for (let i = 0, { length } = values; i < length; i += 1) {
      const value = values[i]!
      if (record.has(value)) {
        SetPrototypeDelete(out, value)
      }
    }
    return out
  }
  const keys = recordKeysOf(record)
  for (let i = 0, { length } = keys; i < length; i += 1) {
    SetPrototypeDelete(out, keys[i]!)
  }
  return out
}

/**
 * `Set.prototype.intersection` shim.
 *
 * The smaller side is iterated, which is why the result order depends on which
 * side that is. The choice is not an optimization detail: it decides whose
 * `has` runs, and a caller with a custom `has` sees the difference.
 */
export function setIntersectionShim<T>(
  set: ReadonlySet<T>,
  other: SetLike<T>,
): Set<T> {
  const record = setRecordOf<T>(other)
  const out = new SetCtor<T>()
  if (setSizeOf(set) <= record.size) {
    const values = setValuesOf(set)
    for (let i = 0, { length } = values; i < length; i += 1) {
      const value = values[i]!
      if (record.has(value)) {
        SetPrototypeAdd(out, value)
      }
    }
    return out
  }
  const keys = recordKeysOf(record)
  for (let i = 0, { length } = keys; i < length; i += 1) {
    const value = keys[i]!
    if (SetPrototypeHas(set, value)) {
      SetPrototypeAdd(out, value)
    }
  }
  return out
}

/**
 * `Set.prototype.isDisjointFrom` shim. Iterates the smaller side, so which
 * `has` runs depends on the sizes, and closes the set-like's iterator when it
 * stops early.
 */
export function setIsDisjointFromShim<T>(
  set: ReadonlySet<T>,
  other: SetLike<T>,
): boolean {
  const record = setRecordOf<T>(other)
  if (setSizeOf(set) <= record.size) {
    // Live, for the same reason as isSubsetOf: `has` may delete from the
    // receiver mid-run.
    const own = SetPrototypeValues(set)
    const ownStep = nextOf<T>(own)
    for (;;) {
      const result = ownStep()
      if (result.done) {
        return true
      }
      if (record.has(result.value)) {
        return false
      }
    }
  }
  const iterator = record.keys()
  const step = nextOf<T>(iterator)
  for (;;) {
    const result = step()
    if (result.done) {
      return true
    }
    if (SetPrototypeHas(set, result.value)) {
      closeIterator(iterator)
      return false
    }
  }
}

/**
 * `Set.prototype.isSubsetOf` shim. A receiver larger than `other` cannot be a
 * subset, so the size check short-circuits before any `has` call.
 */
export function setIsSubsetOfShim<T>(
  set: ReadonlySet<T>,
  other: SetLike<T>,
): boolean {
  const record = setRecordOf<T>(other)
  if (setSizeOf(set) > record.size) {
    return false
  }
  // Iterated LIVE, not from a snapshot: `has` may delete from the receiver,
  // and an element removed before its turn is never visited. `union` and
  // friends snapshot instead, because they are specified against the receiver
  // as it was on entry.
  const iterator = SetPrototypeValues(set)
  const step = nextOf<T>(iterator)
  for (;;) {
    const result = step()
    if (result.done) {
      return true
    }
    if (!record.has(result.value)) {
      return false
    }
  }
}

/**
 * `Set.prototype.isSupersetOf` shim. Reads `other`'s keys rather than calling
 * its `has`, which is the reverse of `isSubsetOf`, and closes that iterator
 * when it stops early.
 */
export function setIsSupersetOfShim<T>(
  set: ReadonlySet<T>,
  other: SetLike<T>,
): boolean {
  const record = setRecordOf<T>(other)
  if (setSizeOf(set) < record.size) {
    return false
  }
  const iterator = record.keys()
  const step = nextOf<T>(iterator)
  for (;;) {
    const result = step()
    if (result.done) {
      return true
    }
    if (!SetPrototypeHas(set, result.value)) {
      closeIterator(iterator)
      return false
    }
  }
}

/**
 * A method returning a new set: union, intersection, difference,
 * symmetricDifference.
 */
export type SetCombineFn = <T>(set: ReadonlySet<T>, other: SetLike<T>) => Set<T>

/**
 * A method returning a boolean: isSubsetOf, isSupersetOf, isDisjointFrom.
 */
export type SetPredicateFn = <T>(
  set: ReadonlySet<T>,
  other: SetLike<T>,
) => boolean

/**
 * A set-like argument, reduced to the three members these methods use.
 */
export interface SetLike<T> {
  has: (value: T) => boolean
  // `Iterator`, not `IterableIterator`: the spec's GetIteratorDirect reads only
  // `next`, so a set-like may hand back a bare iterator that is not itself
  // iterable, and test262 does exactly that.
  keys: () => Iterator<T>
  size: number
}

/**
 * The parts of the spec's Set Record a caller can observe.
 */
export interface SetRecord<T> {
  has: (value: T) => boolean
  keys: () => Iterator<T>
  size: number
}

/**
 * Read `size`, `has`, and `keys` off a set-like, IN THAT ORDER.
 *
 * The order is observable: a set-like whose `size` getter throws must never
 * reach the `has` lookup. An undefined `size` becomes NaN and throws a
 * TypeError; a negative one throws a RangeError.
 */
export function setRecordOf<T>(other: unknown): SetRecord<T> {
  if (other === null || typeof other !== 'object') {
    throw new TypeErrorCtor('The argument must be an object')
  }
  const rawSize = ReflectGet(other, 'size')
  // ToNumber, not the Number constructor: `Number(1n)` quietly returns 1,
  // where the spec's ToNumber throws on a BigInt.
  if (typeof rawSize === 'bigint') {
    throw new TypeErrorCtor('The size must not be a BigInt')
  }
  const numSize = NumberCtor(rawSize)
  if (NumberIsNaN(numSize)) {
    throw new TypeErrorCtor('The argument must have a numeric size')
  }
  const intSize = NumberIsFinite(numSize) ? MathTrunc(numSize) : numSize
  if (intSize < 0) {
    throw new RangeErrorCtor('The size must not be negative')
  }
  const has = ReflectGet(other, 'has')
  if (typeof has !== 'function') {
    throw new TypeErrorCtor('The argument must have a callable has')
  }
  const keys = ReflectGet(other, 'keys')
  if (typeof keys !== 'function') {
    throw new TypeErrorCtor('The argument must have a callable keys')
  }
  return {
    has: (value: T) => Boolean(ReflectApply(has, other, [value])),
    keys: () => ReflectApply(keys, other, []) as Iterator<T>,
    size: intSize,
  }
}

/**
 * The receiver's element count, read through the real `size` accessor so a
 * non-Set receiver throws here rather than silently reporting undefined.
 */
export function setSizeOf<T>(set: ReadonlySet<T>): number {
  return SetPrototypeSizeGetter(set)
}

/**
 * `Set.prototype.symmetricDifference` shim. The elements in exactly one side:
 * the receiver's first, then `other`'s.
 */
export function setSymmetricDifferenceShim<T>(
  set: ReadonlySet<T>,
  other: SetLike<T>,
): Set<T> {
  const record = setRecordOf<T>(other)
  const values = setValuesOf(set)
  // `other`'s keys are drained first so a `keys` iterator that mutates the
  // receiver cannot change which side an element counts on.
  const keys = recordKeysOf(record)
  const out = new SetCtor<T>()
  for (let i = 0, { length } = values; i < length; i += 1) {
    SetPrototypeAdd(out, values[i]!)
  }
  for (let i = 0, { length } = keys; i < length; i += 1) {
    const value = keys[i]!
    if (SetPrototypeHas(set, value)) {
      SetPrototypeDelete(out, value)
    } else {
      SetPrototypeAdd(out, value)
    }
  }
  return out
}

/**
 * `Set.prototype.union` shim. Every element of the receiver in its own order,
 * then each element of `other` not already present.
 */
export function setUnionShim<T>(
  set: ReadonlySet<T>,
  other: SetLike<T>,
): Set<T> {
  const record = setRecordOf<T>(other)
  const values = setValuesOf(set)
  const keys = recordKeysOf(record)
  const out = new SetCtor<T>()
  for (let i = 0, { length } = values; i < length; i += 1) {
    SetPrototypeAdd(out, values[i]!)
  }
  for (let i = 0, { length } = keys; i < length; i += 1) {
    SetPrototypeAdd(out, keys[i]!)
  }
  return out
}

/**
 * The receiver's elements as an array, in insertion order.
 *
 * Copied up front through the primordial iterator: a set-like's `keys` may
 * mutate the receiver mid-run, and every method is specified against the
 * receiver as it was on entry.
 */
export function setValuesOf<T>(set: ReadonlySet<T>): T[] {
  const iterator = SetPrototypeValues(set)
  const out: T[] = []
  for (;;) {
    const step = iterator.next()
    if (step.done) {
      return out
    }
    out.push(step.value)
  }
}

export const setDifferenceNative = nativeSetCombine('difference')

export const setDifference: SetCombineFn =
  setDifferenceNative ?? setDifferenceShim

export const setIntersectionNative = nativeSetCombine('intersection')

export const setIntersection: SetCombineFn =
  setIntersectionNative ?? setIntersectionShim

export const setIsDisjointFromNative = nativeSetPredicate('isDisjointFrom')

export const setIsDisjointFrom: SetPredicateFn =
  setIsDisjointFromNative ?? setIsDisjointFromShim

export const setIsSubsetOfNative = nativeSetPredicate('isSubsetOf')

export const setIsSubsetOf: SetPredicateFn =
  setIsSubsetOfNative ?? setIsSubsetOfShim

export const setIsSupersetOfNative = nativeSetPredicate('isSupersetOf')

export const setIsSupersetOf: SetPredicateFn =
  setIsSupersetOfNative ?? setIsSupersetOfShim

export const setSymmetricDifferenceNative = nativeSetCombine(
  'symmetricDifference',
)

export const setSymmetricDifference: SetCombineFn =
  setSymmetricDifferenceNative ?? setSymmetricDifferenceShim

export const setUnionNative = nativeSetCombine('union')

export const setUnion: SetCombineFn = setUnionNative ?? setUnionShim
