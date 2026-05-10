/**
 * @fileoverview Sorted-object helpers: `entryKeyComparator`,
 * `objectEntries`, `toSortedObject`, `toSortedObjectFromEntries`.
 *
 * Symbol keys sort separately from string keys (placed first in the
 * resulting object) — this matters for serialization stability since
 * `Object.keys` and `JSON.stringify` will iterate insertion order.
 */

import { ObjectFromEntries } from '../primordials/object'
import { ReflectOwnKeys } from '../primordials/reflect'
import { localeCompare } from '../sorts'

import type { SortedObject } from './types'

/**
 * Compare two entry arrays by their keys for sorting.
 *
 * Used internally for alphabetically sorting object entries.
 * String keys are compared directly, non-string keys are converted to strings first.
 *
 * @param a - First entry tuple [key, value]
 * @param b - Second entry tuple [key, value]
 * @returns Negative if a < b, positive if a > b, zero if equal
 *
 * @example
 * ```ts
 * const entries = [['zebra', 1], ['apple', 2], ['banana', 3]]
 * entries.sort(entryKeyComparator)
 * // [['apple', 2], ['banana', 3], ['zebra', 1]]
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function entryKeyComparator(
  a: [PropertyKey, unknown],
  b: [PropertyKey, unknown],
): number {
  const keyA = a[0]
  const keyB = b[0]
  const strKeyA = typeof keyA === 'string' ? keyA : String(keyA)
  const strKeyB = typeof keyB === 'string' ? keyB : String(keyB)
  return localeCompare(strKeyA, strKeyB)
}

/**
 * Get all own property entries (key-value pairs) from an object.
 *
 * Unlike `Object.entries()`, this includes non-enumerable properties and
 * symbol keys. Returns an empty array for null/undefined.
 *
 * @param obj - The object to get entries from
 * @returns Array of [key, value] tuples, or empty array for null/undefined
 *
 * @example
 * ```ts
 * objectEntries({ a: 1, b: 2 })                    // [['a', 1], ['b', 2]]
 * objectEntries({ [Symbol('k')]: 'v', x: 10 })      // [[Symbol(k), 'v'], ['x', 10]]
 * objectEntries(null)                               // []
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function objectEntries(obj: unknown): Array<[PropertyKey, unknown]> {
  if (obj === null || obj === undefined) {
    return []
  }
  const keys = ReflectOwnKeys(obj as object)
  const { length } = keys
  const entries = Array(length)
  const record = obj as Record<PropertyKey, unknown>
  for (let i = 0; i < length; i += 1) {
    const key = keys[i] as PropertyKey
    entries[i] = [key, record[key]]
  }
  return entries
}

/**
 * Convert an object to a new object with sorted keys.
 *
 * Creates a new object with the same properties as the input, but with keys
 * sorted alphabetically. Symbol keys are sorted separately and placed first.
 * This is useful for consistent key ordering in serialization or comparisons.
 *
 * @param obj - The object to sort
 * @returns A new object with sorted keys
 *
 * @example
 * ```ts
 * toSortedObject({ z: 1, a: 2, m: 3 })   // { a: 2, m: 3, z: 1 }
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function toSortedObject<T extends object>(obj: T): T {
  return toSortedObjectFromEntries(objectEntries(obj)) as T
}

/**
 * Create an object from entries with sorted keys.
 *
 * Takes an iterable of [key, value] entries and creates a new object with
 * keys sorted alphabetically. Symbol keys are sorted separately and placed
 * first in the resulting object.
 *
 * @param entries - Iterable of [key, value] tuples
 * @returns A new object with sorted keys
 *
 * @example
 * ```ts
 * toSortedObjectFromEntries([['z', 1], ['a', 2], ['m', 3]])
 * // { a: 2, m: 3, z: 1 }
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function toSortedObjectFromEntries<T = unknown>(
  entries: Iterable<[PropertyKey, T]>,
): SortedObject<T> {
  const otherEntries = []
  const symbolEntries = []
  // Use for-of to work with entries iterators.
  for (const entry of entries) {
    if (typeof entry[0] === 'symbol') {
      symbolEntries.push(entry)
    } else {
      otherEntries.push(entry)
    }
  }
  if (!otherEntries.length && !symbolEntries.length) {
    return {}
  }
  return ObjectFromEntries([
    // The String constructor is safe to use with symbols.
    ...symbolEntries.sort(entryKeyComparator),
    ...otherEntries.sort(entryKeyComparator),
  ])
}
