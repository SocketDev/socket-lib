/**
 * @file Shims for `Object.groupBy` and `Map.groupBy`, both Node 21.
 *   The two differ in more than their container, which is why they are separate
 *   spec algorithms rather than one with a flag:
 *
 *   - `Object.groupBy` coerces each key with ToPropertyKey, so `1` and `'1'` land
 *     in the SAME group, and it returns a null-prototype object so a key named
 *     `toString` cannot collide with `Object.prototype`.
 *   - `Map.groupBy` keys by SameValueZero, so `1` and `'1'` stay apart, and any
 *     value at all can be a key. Both pass the index as the callback's second
 *     argument and both iterate the iterable exactly once.
 */

import { TypeErrorCtor } from '../primordials/error.mjs'
import { MapCtor } from '../primordials/map-set.mjs'
import { ObjectCtor } from '../primordials/object.mjs'

/**
 * The native `Map.groupBy`, or undefined below Node 21.
 */
export const mapGroupByNative:
  | (<K, T>(
      items: Iterable<T>,
      keySelector: (item: T, index: number) => K,
    ) => Map<K, T[]>)
  | undefined =
  typeof (MapCtor as { groupBy?: unknown | undefined }).groupBy === 'function'
    ? ((MapCtor as { groupBy?: unknown | undefined }).groupBy as <K, T>(
        items: Iterable<T>,
        keySelector: (item: T, index: number) => K,
      ) => Map<K, T[]>)
    : undefined

/**
 * `Map.groupBy` shim. Keys compare by SameValueZero, which `Map` already does,
 * so no coercion happens and `1` stays distinct from `'1'`.
 */
export function mapGroupByShim<K, T>(
  items: Iterable<T>,
  keySelector: (item: T, index: number) => K,
): Map<K, T[]> {
  if (typeof keySelector !== 'function') {
    throw new TypeErrorCtor('The callback must be a function')
  }
  const groups = new MapCtor<K, T[]>()
  let index = 0
  for (const item of items) {
    const key = keySelector(item, index)
    const bucket = groups.get(key)
    if (bucket === undefined) {
      groups.set(key, [item])
    } else {
      bucket.push(item)
    }
    index += 1
  }
  return groups
}

export const mapGroupBy: <K, T>(
  items: Iterable<T>,
  keySelector: (item: T, index: number) => K,
) => Map<K, T[]> = mapGroupByNative ?? mapGroupByShim

/**
 * The native `Object.groupBy`, or undefined below Node 21.
 */
export const objectGroupByNative:
  | (<K extends PropertyKey, T>(
      items: Iterable<T>,
      keySelector: (item: T, index: number) => K,
    ) => Partial<Record<K, T[]>>)
  | undefined =
  typeof (ObjectCtor as { groupBy?: unknown | undefined }).groupBy ===
  'function'
    ? ((ObjectCtor as { groupBy?: unknown | undefined }).groupBy as <
        K extends PropertyKey,
        T,
      >(
        items: Iterable<T>,
        keySelector: (item: T, index: number) => K,
      ) => Partial<Record<K, T[]>>)
    : undefined

/**
 * `Object.groupBy` shim. The result has a null prototype, per spec, so a group
 * keyed `toString` or `__proto__` is an ordinary own property.
 */
export function objectGroupByShim<K extends PropertyKey, T>(
  items: Iterable<T>,
  keySelector: (item: T, index: number) => K,
): Partial<Record<K, T[]>> {
  if (typeof keySelector !== 'function') {
    throw new TypeErrorCtor('The callback must be a function')
  }
  // oxlint-disable-next-line socket/prefer-undefined-over-null -- spec: null proto
  const groups = ObjectCtor.create(null) as Record<PropertyKey, T[]>
  let index = 0
  for (const item of items) {
    // ToPropertyKey: a numeric key becomes its string form, so 1 and '1' group
    // together the way a property access would.
    const key = keySelector(item, index) as PropertyKey
    const bucket = groups[key]
    if (bucket === undefined) {
      groups[key] = [item]
    } else {
      bucket.push(item)
    }
    index += 1
  }
  return groups as Partial<Record<K, T[]>>
}

export const objectGroupBy: <K extends PropertyKey, T>(
  items: Iterable<T>,
  keySelector: (item: T, index: number) => K,
) => Partial<Record<K, T[]>> = objectGroupByNative ?? objectGroupByShim
