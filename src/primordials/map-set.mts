/**
 * @file Safe references to `Map`, `Set`, `WeakMap`, `WeakSet`, and `WeakRef`.
 *   Constructors plus uncurried prototype methods. `WeakRef` exposes only its
 *   constructor — there's a separate `weakRefSafe` wrapper in `./uncurry` for
 *   the throws-on-non-Object case.
 */

import { TypeErrorCtor } from './error.mjs'
import { ObjectGetOwnPropertyDescriptor } from './object.mjs'
import { uncurryThis } from './uncurry.mjs'

// Stage 3+ TC39 proposals that Node 22+ ships but TypeScript's
// lib.es2024.* still lacks. Ambient-declare here until the lib catches
// up. References:
//   - getOrInsert: https://github.com/tc39/proposal-upsert
//   - Set composition: https://github.com/tc39/proposal-set-methods
declare global {
  interface Map<K, V> {
    getOrInsert(key: K, value: V): V
    getOrInsertComputed(key: K, callbackfn: (key: K) => V): V
  }
  interface WeakMap<K extends WeakKey, V> {
    getOrInsert(key: K, value: V): V
    getOrInsertComputed(key: K, callbackfn: (key: K) => V): V
  }
  interface ReadonlySetLike<T> {
    has(value: T): boolean
    keys(): IterableIterator<T>
    readonly size: number
  }
  interface Set<T> {
    difference<U>(other: ReadonlySetLike<U>): Set<T>
    intersection<U>(other: ReadonlySetLike<U>): Set<T & U>
    isDisjointFrom(other: ReadonlySetLike<unknown>): boolean
    isSubsetOf(other: ReadonlySetLike<unknown>): boolean
    isSupersetOf(other: ReadonlySetLike<unknown>): boolean
    symmetricDifference<U>(other: ReadonlySetLike<U>): Set<T | U>
    union<U>(other: ReadonlySetLike<U>): Set<T | U>
  }
}

// ─── Constructors ──────────────────────────────────────────────────────
export const MapCtor: MapConstructor = Map
export const SetCtor: SetConstructor = Set
export const WeakMapCtor: WeakMapConstructor = WeakMap
export const WeakRefCtor: WeakRefConstructor = WeakRef
export const WeakSetCtor: WeakSetConstructor = WeakSet

// ─── Map (prototype) ───────────────────────────────────────────────────
export const MapPrototypeClear = uncurryThis(Map.prototype.clear)
export const MapPrototypeDelete = uncurryThis(Map.prototype.delete)
export const MapPrototypeEntries = uncurryThis(Map.prototype.entries)
export const MapPrototypeForEach = uncurryThis(Map.prototype.forEach)
export const MapPrototypeGet = uncurryThis(Map.prototype.get)
// getOrInsert / getOrInsertComputed (tc39 proposal-upsert) ship unflagged
// only from Node 25 — engines allows >=22, so each export falls back to a
// spec-equivalent built from the captured primordials when the native is
// absent.
export const MapPrototypeGetOrInsert =
  Map.prototype.getOrInsert === undefined
    ? mapGetOrInsertFallback
    : uncurryThis(Map.prototype.getOrInsert)
export const MapPrototypeGetOrInsertComputed =
  Map.prototype.getOrInsertComputed === undefined
    ? mapGetOrInsertComputedFallback
    : uncurryThis(Map.prototype.getOrInsertComputed)
export const MapPrototypeHas = uncurryThis(Map.prototype.has)
export const MapPrototypeKeys = uncurryThis(Map.prototype.keys)
export const MapPrototypeSet = uncurryThis(Map.prototype.set)
export const MapPrototypeValues = uncurryThis(Map.prototype.values)

// ─── Set (prototype) ───────────────────────────────────────────────────
export const SetPrototypeAdd = uncurryThis(Set.prototype.add)
export const SetPrototypeClear = uncurryThis(Set.prototype.clear)
export const SetPrototypeDelete = uncurryThis(Set.prototype.delete)
export const SetPrototypeDifference = uncurryThis(Set.prototype.difference)
export const SetPrototypeEntries = uncurryThis(Set.prototype.entries)
export const SetPrototypeForEach = uncurryThis(Set.prototype.forEach)
export const SetPrototypeHas = uncurryThis(Set.prototype.has)
export const SetPrototypeIntersection = uncurryThis(Set.prototype.intersection)
export const SetPrototypeIsDisjointFrom = uncurryThis(
  Set.prototype.isDisjointFrom,
)
export const SetPrototypeIsSubsetOf = uncurryThis(Set.prototype.isSubsetOf)
export const SetPrototypeIsSupersetOf = uncurryThis(Set.prototype.isSupersetOf)
export const SetPrototypeKeys = uncurryThis(Set.prototype.keys)
export const SetPrototypeSymmetricDifference = uncurryThis(
  Set.prototype.symmetricDifference,
)
export const SetPrototypeUnion = uncurryThis(Set.prototype.union)
export const SetPrototypeValues = uncurryThis(Set.prototype.values)
// `size` is an accessor rather than a method, so it is captured from its
// descriptor. Reading `set.size` directly would go through a prototype the
// caller can patch, and would not throw on a non-Set the way the real getter
// does.
export const SetPrototypeSizeGetter = uncurryThis(
  ObjectGetOwnPropertyDescriptor(Set.prototype, 'size')!.get!,
)

// ─── WeakMap (prototype) ───────────────────────────────────────────────
export const WeakMapPrototypeDelete = uncurryThis(WeakMap.prototype.delete)
export const WeakMapPrototypeGet = uncurryThis(WeakMap.prototype.get)
export const WeakMapPrototypeGetOrInsert =
  WeakMap.prototype.getOrInsert === undefined
    ? weakMapGetOrInsertFallback
    : uncurryThis(WeakMap.prototype.getOrInsert)
export const WeakMapPrototypeGetOrInsertComputed =
  WeakMap.prototype.getOrInsertComputed === undefined
    ? weakMapGetOrInsertComputedFallback
    : uncurryThis(WeakMap.prototype.getOrInsertComputed)
export const WeakMapPrototypeHas = uncurryThis(WeakMap.prototype.has)
export const WeakMapPrototypeSet = uncurryThis(WeakMap.prototype.set)

// ─── WeakSet (prototype) ───────────────────────────────────────────────
export const WeakSetPrototypeAdd = uncurryThis(WeakSet.prototype.add)
export const WeakSetPrototypeDelete = uncurryThis(WeakSet.prototype.delete)
export const WeakSetPrototypeHas = uncurryThis(WeakSet.prototype.has)

// ─── proposal-upsert fallbacks ─────────────────────────────────────────
// Hoisted function declarations referenced by the conditional exports
// above. Each mirrors the proposal's algorithm: existing entry wins,
// otherwise insert (computing via the callback, which — per spec — is
// only invoked on a miss, and whose result is stored even if the
// callback itself touched the map).
export function mapGetOrInsertComputedFallback<K, V>(
  map: Map<K, V>,
  key: K,
  callbackfn: (key: K) => V,
): V {
  if (typeof callbackfn !== 'function') {
    throw new TypeErrorCtor(
      `getOrInsertComputed takes a callback. Saw ${typeof callbackfn}, wanted a function computing the value to insert.`,
    )
  }
  if (MapPrototypeHas(map, key)) {
    return MapPrototypeGet(map, key) as V
  }
  const value = callbackfn(key)
  MapPrototypeSet(map, key, value)
  return value
}

export function mapGetOrInsertFallback<K, V>(
  map: Map<K, V>,
  key: K,
  value: V,
): V {
  if (MapPrototypeHas(map, key)) {
    return MapPrototypeGet(map, key) as V
  }
  MapPrototypeSet(map, key, value)
  return value
}

export function weakMapGetOrInsertComputedFallback<K extends WeakKey, V>(
  map: WeakMap<K, V>,
  key: K,
  callbackfn: (key: K) => V,
): V {
  if (typeof callbackfn !== 'function') {
    throw new TypeErrorCtor(
      `getOrInsertComputed takes a callback. Saw ${typeof callbackfn}, wanted a function computing the value to insert.`,
    )
  }
  if (WeakMapPrototypeHas(map, key)) {
    return WeakMapPrototypeGet(map, key) as V
  }
  const value = callbackfn(key)
  WeakMapPrototypeSet(map, key, value)
  return value
}

export function weakMapGetOrInsertFallback<K extends WeakKey, V>(
  map: WeakMap<K, V>,
  key: K,
  value: V,
): V {
  if (WeakMapPrototypeHas(map, key)) {
    return WeakMapPrototypeGet(map, key) as V
  }
  WeakMapPrototypeSet(map, key, value)
  return value
}
