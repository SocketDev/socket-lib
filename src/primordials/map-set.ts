/**
 * @file Safe references to `Map`, `Set`, `WeakMap`, `WeakSet`, and `WeakRef`.
 *   Constructors plus uncurried prototype methods. `WeakRef` exposes only its
 *   constructor — there's a separate `weakRefSafe` wrapper in `./uncurry` for
 *   the throws-on-non-Object case.
 */

import { uncurryThis } from './uncurry'

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
export const MapPrototypeGetOrInsert = uncurryThis(Map.prototype.getOrInsert)
export const MapPrototypeGetOrInsertComputed = uncurryThis(
  Map.prototype.getOrInsertComputed,
)
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

// ─── WeakMap (prototype) ───────────────────────────────────────────────
export const WeakMapPrototypeDelete = uncurryThis(WeakMap.prototype.delete)
export const WeakMapPrototypeGet = uncurryThis(WeakMap.prototype.get)
export const WeakMapPrototypeGetOrInsert = uncurryThis(
  WeakMap.prototype.getOrInsert,
)
export const WeakMapPrototypeGetOrInsertComputed = uncurryThis(
  WeakMap.prototype.getOrInsertComputed,
)
export const WeakMapPrototypeHas = uncurryThis(WeakMap.prototype.has)
export const WeakMapPrototypeSet = uncurryThis(WeakMap.prototype.set)

// ─── WeakSet (prototype) ───────────────────────────────────────────────
export const WeakSetPrototypeAdd = uncurryThis(WeakSet.prototype.add)
export const WeakSetPrototypeDelete = uncurryThis(WeakSet.prototype.delete)
export const WeakSetPrototypeHas = uncurryThis(WeakSet.prototype.has)
