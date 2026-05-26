/**
 * @file Safe references to `Map`, `Set`, `WeakMap`, `WeakSet`, and `WeakRef`.
 *   Constructors plus uncurried prototype methods. `WeakRef` exposes only its
 *   constructor — there's a separate `weakRefSafe` wrapper in `./uncurry` for
 *   the throws-on-non-Object case.
 */

import { uncurryThis } from './uncurry'

// TC39 Stage 3 `getOrInsert` proposal — Node 22.10+ ships these, but
// TypeScript's lib.es2024.* still lacks them. Ambient-declare here until
// the lib catches up.
declare global {
  interface Map<K, V> {
    getOrInsert(key: K, value: V): V
    getOrInsertComputed(key: K, callbackfn: (key: K) => V): V
  }
  interface WeakMap<K extends WeakKey, V> {
    getOrInsert(key: K, value: V): V
    getOrInsertComputed(key: K, callbackfn: (key: K) => V): V
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
export const SetPrototypeEntries = uncurryThis(Set.prototype.entries)
export const SetPrototypeForEach = uncurryThis(Set.prototype.forEach)
export const SetPrototypeHas = uncurryThis(Set.prototype.has)
export const SetPrototypeKeys = uncurryThis(Set.prototype.keys)
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
