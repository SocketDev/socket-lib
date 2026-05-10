/**
 * @fileoverview Object inspection helpers — `getKeys`, `getOwn`,
 * `getOwnPropertyValues`. Safe accessors that return empty / undefined
 * on null inputs instead of throwing.
 */

import {
  ObjectGetOwnPropertyNames,
  ObjectHasOwn,
  ObjectKeys,
} from '../primordials/object'

import { isObject } from './predicates'

/**
 * Get the enumerable own property keys of an object.
 *
 * This is a safe wrapper around `Object.keys()` that returns an empty array
 * for non-object values instead of throwing an error.
 *
 * @param obj - The value to get keys from
 * @returns Array of enumerable string keys, or empty array for non-objects
 *
 * @example
 * ```ts
 * getKeys({ a: 1, b: 2 })   // ['a', 'b']
 * getKeys([10, 20, 30])     // ['0', '1', '2']
 * getKeys(null)             // []
 * getKeys('hello')          // []
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getKeys(obj: unknown): string[] {
  return isObject(obj) ? ObjectKeys(obj) : []
}

/**
 * Get an own property value from an object safely.
 *
 * Returns `undefined` if the value is null/undefined or if the property
 * doesn't exist as an own property (not inherited). This avoids prototype
 * chain lookups and prevents errors on null/undefined values.
 *
 * @param obj - The object to get the property from
 * @param propKey - The property key to look up
 * @returns The property value, or `undefined` if not found or obj is null/undefined
 *
 * @example
 * ```ts
 * const obj = { name: 'Alice', age: 30 }
 * getOwn(obj, 'name')          // 'Alice'
 * getOwn(obj, 'missing')       // undefined
 * getOwn(obj, 'toString')      // undefined (inherited)
 * getOwn(null, 'name')         // undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getOwn(obj: unknown, propKey: PropertyKey): unknown {
  if (obj === null || obj === undefined) {
    return undefined
  }
  return ObjectHasOwn(obj as object, propKey)
    ? (obj as Record<PropertyKey, unknown>)[propKey]
    : undefined
}

/**
 * Get all own property values from an object.
 *
 * Returns values for all own properties (enumerable and non-enumerable),
 * but not inherited properties. Returns an empty array for null/undefined.
 *
 * @param obj - The object to get values from
 * @returns Array of all own property values, or empty array for null/undefined
 *
 * @example
 * ```ts
 * getOwnPropertyValues({ a: 1, b: 2, c: 3 })   // [1, 2, 3]
 * getOwnPropertyValues([10, 20, 30])           // [10, 20, 30]
 * getOwnPropertyValues(null)                   // []
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getOwnPropertyValues<T>(
  obj: { [key: PropertyKey]: T } | null | undefined,
): T[] {
  if (obj === null || obj === undefined) {
    return []
  }
  const keys = ObjectGetOwnPropertyNames(obj)
  const { length } = keys
  const values = Array(length)
  for (let i = 0; i < length; i += 1) {
    values[i] = obj[keys[i] as string]
  }
  return values
}
