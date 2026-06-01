/**
 * @file Safe references to `Object` static methods and prototype methods. Annex
 *   B legacy accessor methods (`__defineGetter__`, `__lookupGetter__`, etc.)
 *   are exposed alongside the canonical static methods — implementations exist
 *   in V8, SpiderMonkey, and JavaScriptCore even though the spec calls them
 *   "normative optional".
 */

import { uncurryThis } from './uncurry'

export const ObjectCtor: ObjectConstructor = Object

// ─── Object (static) ───────────────────────────────────────────────────
export const ObjectAssign = Object.assign
export const ObjectCreate = Object.create
export const ObjectDefineProperties = Object.defineProperties
export const ObjectDefineProperty = Object.defineProperty
export const ObjectEntries = Object.entries
export const ObjectFreeze = Object.freeze
export const ObjectFromEntries = Object.fromEntries
export const ObjectGetOwnPropertyDescriptor = Object.getOwnPropertyDescriptor
export const ObjectGetOwnPropertyDescriptors = Object.getOwnPropertyDescriptors
export const ObjectGetOwnPropertyNames = Object.getOwnPropertyNames
export const ObjectGetOwnPropertySymbols = Object.getOwnPropertySymbols
export const ObjectGetPrototypeOf = Object.getPrototypeOf
export const ObjectHasOwn = Object.hasOwn
export const ObjectIs = Object.is
export const ObjectIsExtensible = Object.isExtensible
export const ObjectIsFrozen = Object.isFrozen
export const ObjectIsSealed = Object.isSealed
export const ObjectKeys = Object.keys
export const ObjectPreventExtensions = Object.preventExtensions
export const ObjectSeal = Object.seal
export const ObjectSetPrototypeOf = Object.setPrototypeOf
export const ObjectValues = Object.values

// ─── Object (prototype) ────────────────────────────────────────────────
export const ObjectPrototype = Object.prototype
export const ObjectPrototypeHasOwnProperty = uncurryThis(
  Object.prototype.hasOwnProperty,
)
export const ObjectPrototypeIsPrototypeOf = uncurryThis(
  Object.prototype.isPrototypeOf,
)
export const ObjectPrototypePropertyIsEnumerable = uncurryThis(
  Object.prototype.propertyIsEnumerable,
)
export const ObjectPrototypeToString = uncurryThis(Object.prototype.toString)
export const ObjectPrototypeValueOf = uncurryThis(Object.prototype.valueOf)

// Annex B legacy accessor methods. Spec'd as "normative optional" but
// implemented in every major engine (V8, SpiderMonkey, JavaScriptCore).
// Equivalent to Object.defineProperty / Object.getOwnPropertyDescriptor
// but operate on a target's prototype chain rather than its own props,
// which is occasionally what you actually want (e.g. probing whether
// a class defines a getter without instantiating).
//
// See: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Object/__lookupGetter__
const objectProto = Object.prototype as unknown as {
  __defineGetter__: (this: object, key: PropertyKey, fn: () => unknown) => void
  __defineSetter__: (
    this: object,
    key: PropertyKey,
    fn: (value: unknown) => void,
  ) => void
  __lookupGetter__: (
    this: object,
    key: PropertyKey,
  ) => (() => unknown) | undefined
  __lookupSetter__: (
    this: object,
    key: PropertyKey,
  ) => ((value: unknown) => void) | undefined
}
export const ObjectPrototypeDefineGetter = uncurryThis(
  objectProto.__defineGetter__,
)
export const ObjectPrototypeDefineSetter = uncurryThis(
  objectProto.__defineSetter__,
)
export const ObjectPrototypeLookupGetter = uncurryThis(
  objectProto.__lookupGetter__,
)
export const ObjectPrototypeLookupSetter = uncurryThis(
  objectProto.__lookupSetter__,
)
