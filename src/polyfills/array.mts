/**
 * @file Shims for the ES2023 change-array-by-copy methods, both Node 20.
 *   Only the two the tree consumes are here: `toSorted` and `toReversed`.
 *   Both produce a DENSE result. Reading a hole yields undefined rather than
 *   propagating the hole, and `toSorted` places every undefined at the end
 *   regardless of the comparator, which is the part a `[...arr].sort(cmp)`
 *   rewrite gets right only by accident and a `filter(Boolean)` rewrite gets
 *   wrong outright.
 */

import { ArrayCtor, ArrayPrototypeSort } from '../primordials/array.mjs'
import { TypeErrorCtor } from '../primordials/error.mjs'

export type ToReversedFn = <T>(arr: readonly T[]) => T[]

export type ToSortedFn = <T>(
  arr: readonly T[],
  comparator?: ((a: T, b: T) => number) | undefined,
) => T[]

/**
 * The native `Array.prototype.toReversed`, or undefined below Node 20.
 */
export const arrayToReversedNative: ToReversedFn | undefined =
  typeof (ArrayCtor.prototype as { toReversed?: unknown | undefined })
    .toReversed === 'function'
    ? <T,>(arr: readonly T[]) => (arr as { toReversed: () => T[] }).toReversed()
    : undefined

/**
 * `Array.prototype.toReversed` shim.
 *
 * Walks the source backwards by index rather than reversing in place, so the
 * input is never mutated and the output is dense.
 */
export function arrayToReversedShim<T>(arr: readonly T[]): T[] {
  const { length } = arr
  const out = new ArrayCtor<T>(length)
  for (let i = 0; i < length; i += 1) {
    out[i] = arr[length - i - 1]!
  }
  return out
}

export const arrayToReversed: ToReversedFn =
  arrayToReversedNative ?? arrayToReversedShim

/**
 * The native `Array.prototype.toSorted`, or undefined below Node 20.
 */
export const arrayToSortedNative: ToSortedFn | undefined =
  typeof (ArrayCtor.prototype as { toSorted?: unknown | undefined })
    .toSorted === 'function'
    ? <T,>(
        arr: readonly T[],
        comparator?: ((a: T, b: T) => number) | undefined,
      ) =>
        (
          arr as {
            toSorted: (c?: ((a: T, b: T) => number) | undefined) => T[]
          }
        ).toSorted(comparator)
    : undefined

/**
 * `Array.prototype.toSorted` shim.
 *
 * The comparator is validated BEFORE any element is read, so a bad comparator
 * throws on an empty array too. `sort` then supplies the rest of the observable
 * contract: a stable order, and undefined last whatever the comparator says.
 */
export function arrayToSortedShim<T>(
  arr: readonly T[],
  comparator?: ((a: T, b: T) => number) | undefined,
): T[] {
  if (comparator !== undefined && typeof comparator !== 'function') {
    throw new TypeErrorCtor('The comparator must be a function or undefined')
  }
  // Copied index by index rather than with slice: slice PRESERVES holes, and a
  // hole sorts after undefined instead of becoming one.
  const { length } = arr
  const out = new ArrayCtor<T>(length)
  for (let i = 0; i < length; i += 1) {
    out[i] = arr[i]!
  }
  return ArrayPrototypeSort(out, comparator)
}

export const arrayToSorted: ToSortedFn =
  arrayToSortedNative ?? arrayToSortedShim
