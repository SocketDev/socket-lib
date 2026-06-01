/**
 * @file Object type guards: `hasKeys`, `hasOwn`, `isObject`, `isPlainObject`.
 *   All four narrow `unknown` to a typed shape and tolerate `null` /
 *   `undefined` without throwing.
 */

import { isArray } from '../arrays/predicates'
import {
  ObjectGetPrototypeOf,
  ObjectHasOwn,
  ObjectPrototype,
} from '../primordials/object'

import type { PropertyBag } from './types'

/**
 * Check if an object has any enumerable own properties.
 *
 * Returns `true` if the object has at least one enumerable own property,
 * `false` otherwise. Also returns `false` for null/undefined.
 *
 * @example
 *   ;```ts
 *   hasKeys({ a: 1 }) // true
 *   hasKeys({}) // false
 *   hasKeys([]) // false
 *   hasKeys([1, 2]) // true
 *   hasKeys(null) // false
 *   hasKeys(undefined) // false
 *   hasKeys(Object.create({ inherited: true })) // false
 *   ```
 *
 * @param obj - The value to check.
 *
 * @returns `true` if obj has enumerable own properties, `false` otherwise
 */
export function hasKeys(obj: unknown): obj is PropertyBag {
  if (obj === null || obj === undefined) {
    return false
  }
  for (const key in obj as object) {
    if (ObjectHasOwn(obj as object, key)) {
      return true
    }
  }
  return false
}

/**
 * Check if an object has an own property.
 *
 * Type-safe wrapper around `Object.hasOwn()` that returns `false` for
 * null/undefined instead of throwing. Only checks own properties, not inherited
 * ones from the prototype chain.
 *
 * @example
 *   ;```ts
 *   const obj = { name: 'Alice' }
 *   hasOwn(obj, 'name') // true
 *   hasOwn(obj, 'age') // false
 *   hasOwn(obj, 'toString') // false (inherited)
 *   hasOwn(null, 'name') // false
 *   ```
 *
 * @param obj - The value to check.
 * @param propKey - The property key to look for.
 *
 * @returns `true` if obj has the property as an own property, `false` otherwise
 */
export function hasOwn(
  obj: unknown,
  propKey: PropertyKey,
): obj is object & PropertyBag {
  if (obj === null || obj === undefined) {
    return false
  }
  return ObjectHasOwn(obj as object, propKey)
}

/**
 * Check if a value is an object (including arrays).
 *
 * Returns `true` for any object type including arrays, dates, etc. Returns
 * `false` for primitives and `null`. Functions are not considered objects here
 * (typeof functions === 'function').
 *
 * @example
 *   ;```ts
 *   isObject({}) // true
 *   isObject([]) // true
 *   isObject(new Date()) // true
 *   isObject(() => {}) // false
 *   isObject(null) // false
 *   ```
 *
 * @param value - The value to check.
 *
 * @returns `true` if value is an object (including arrays), `false` otherwise
 */
export function isObject(
  value: unknown,
): value is { [key: PropertyKey]: unknown } {
  return value !== null && typeof value === 'object'
}

/**
 * Check if a value is a plain object (not an array, not a built-in).
 *
 * Returns `true` only for plain objects created with `{}` or
 * `Object.create(null)`. Returns `false` for arrays, built-in objects (Date,
 * RegExp, etc.), and primitives.
 *
 * @example
 *   ;```ts
 *   isPlainObject({}) // true
 *   isPlainObject({ a: 1 }) // true
 *   isPlainObject(Object.create(null)) // true
 *   isPlainObject([]) // false
 *   isPlainObject(new Date()) // false
 *   ```
 *
 * @param value - The value to check.
 *
 * @returns `true` if value is a plain object, `false` otherwise
 */
export function isPlainObject(
  value: unknown,
): value is { [key: PropertyKey]: unknown } {
  if (value === null || typeof value !== 'object' || isArray(value)) {
    return false
  }
  const proto: object | null = ObjectGetPrototypeOf(value)
  return proto === null || proto === ObjectPrototype
}
