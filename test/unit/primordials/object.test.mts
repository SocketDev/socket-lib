/**
 * @file Unit tests for src/primordials/object — Object static + prototype
 *   primordials. Split out of the historical monolithic
 *   test/unit/primordials.test.mts.
 */

import { describe, expect, it } from 'vitest'

import {
  ObjectAssign,
  ObjectCreate,
  ObjectDefineProperties,
  ObjectDefineProperty,
  ObjectEntries,
  ObjectFreeze,
  ObjectFromEntries,
  ObjectGetOwnPropertyDescriptor,
  ObjectGetOwnPropertyDescriptors,
  ObjectGetOwnPropertyNames,
  ObjectGetOwnPropertySymbols,
  ObjectGetPrototypeOf,
  ObjectHasOwn,
  ObjectIs,
  ObjectIsExtensible,
  ObjectIsFrozen,
  ObjectIsSealed,
  ObjectKeys,
  ObjectPreventExtensions,
  ObjectPrototype,
  ObjectPrototypeDefineGetter,
  ObjectPrototypeDefineSetter,
  ObjectPrototypeHasOwnProperty,
  ObjectPrototypeIsPrototypeOf,
  ObjectPrototypeLookupGetter,
  ObjectPrototypeLookupSetter,
  ObjectPrototypePropertyIsEnumerable,
  ObjectPrototypeToString,
  ObjectPrototypeValueOf,
  ObjectSeal,
  ObjectSetPrototypeOf,
  ObjectValues,
} from '../../../src/primordials/object'

describe('Object (static)', () => {
  it('Assign / Create / DefineProperty / DefineProperties', () => {
    expect(ObjectAssign({}, { a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 })
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- Object.create(null) is the only way to make a null-prototype object.
    const nullProto = ObjectCreate(null)
    expect(Object.getPrototypeOf(nullProto)).toBe(null)
    const obj: Record<string, number> = {}
    ObjectDefineProperty(obj, 'x', { value: 42, enumerable: true })
    expect(obj['x']).toBe(42)
    ObjectDefineProperties(obj, { y: { value: 1, enumerable: true } })
    expect(obj['y']).toBe(1)
  })

  it('Entries / FromEntries round-trip', () => {
    const obj = { a: 1, b: 2 }
    expect(ObjectFromEntries(ObjectEntries(obj))).toEqual(obj)
  })

  it('Freeze / IsFrozen / Seal / IsSealed / PreventExtensions / IsExtensible', () => {
    const frozen = ObjectFreeze({ a: 1 })
    expect(ObjectIsFrozen(frozen)).toBe(true)
    const sealed = ObjectSeal({ a: 1 })
    expect(ObjectIsSealed(sealed)).toBe(true)
    const extensible: Record<string, number> = { a: 1 }
    expect(ObjectIsExtensible(extensible)).toBe(true)
    ObjectPreventExtensions(extensible)
    expect(ObjectIsExtensible(extensible)).toBe(false)
  })

  it('GetOwnPropertyDescriptor / Descriptors / Names / Symbols', () => {
    const obj = { a: 1 }
    const desc = ObjectGetOwnPropertyDescriptor(obj, 'a')
    expect(desc?.value).toBe(1)
    expect(ObjectGetOwnPropertyDescriptors(obj)['a']?.value).toBe(1)
    expect(ObjectGetOwnPropertyNames(obj)).toEqual(['a'])
    const sym = Symbol('s')
    const withSym = { [sym]: 1 }
    expect(ObjectGetOwnPropertySymbols(withSym)).toEqual([sym])
  })

  it('GetPrototypeOf / SetPrototypeOf', () => {
    const proto = { foo: 1 }
    const obj = ObjectCreate(proto)
    expect(ObjectGetPrototypeOf(obj)).toBe(proto)
    const newProto = { bar: 2 }
    ObjectSetPrototypeOf(obj, newProto)
    expect(ObjectGetPrototypeOf(obj)).toBe(newProto)
  })

  it('HasOwn / Is / Keys / Values', () => {
    expect(ObjectHasOwn({ a: 1 }, 'a')).toBe(true)
    expect(ObjectHasOwn({ a: 1 }, 'b')).toBe(false)
    expect(ObjectIs(Number.NaN, Number.NaN)).toBe(true)
    expect(ObjectIs(+0, -0)).toBe(false)
    expect(ObjectKeys({ a: 1, b: 2 })).toEqual(['a', 'b'])
    expect(ObjectValues({ a: 1, b: 2 })).toEqual([1, 2])
  })
})

describe('Object (prototype)', () => {
  it('ObjectPrototype points at Object.prototype', () => {
    expect(ObjectPrototype).toBe(Object.prototype)
  })

  it('HasOwnProperty / IsPrototypeOf / PropertyIsEnumerable / ValueOf', () => {
    expect(ObjectPrototypeHasOwnProperty({ a: 1 }, 'a')).toBe(true)
    expect(ObjectPrototypeHasOwnProperty({ a: 1 }, 'b')).toBe(false)

    const proto = { foo: 1 }
    const child = ObjectCreate(proto)
    expect(ObjectPrototypeIsPrototypeOf(proto, child)).toBe(true)

    const enumObj = { visible: 1 }
    ObjectDefineProperty(enumObj, 'hidden', { value: 2, enumerable: false })
    expect(ObjectPrototypePropertyIsEnumerable(enumObj, 'visible')).toBe(true)
    expect(ObjectPrototypePropertyIsEnumerable(enumObj, 'hidden')).toBe(false)

    // ObjectPrototypeValueOf on a plain object returns the object itself
    // (it's the base identity `valueOf`, not Number.prototype.valueOf).
    const plain = { a: 1 }
    expect(ObjectPrototypeValueOf(plain)).toBe(plain)
  })

  it('ObjectPrototypeToString identifies built-in types', () => {
    expect(ObjectPrototypeToString([])).toBe('[object Array]')
    expect(ObjectPrototypeToString(new Error())).toBe('[object Error]')
    expect(ObjectPrototypeToString(/re/)).toBe('[object RegExp]')
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- spec requires handling null as input
    expect(ObjectPrototypeToString(null)).toBe('[object Null]')
    expect(ObjectPrototypeToString(undefined)).toBe('[object Undefined]')
  })

  it('Annex B accessors: __defineGetter__ / __lookupGetter__ round-trip', () => {
    const target: { x?: number | undefined } = {}
    let invoked = 0
    const getter = (): number => {
      invoked += 1
      return 42
    }
    ObjectPrototypeDefineGetter(target, 'x', getter)
    // Reading the property invokes the getter.
    expect(target.x).toBe(42)
    expect(invoked).toBe(1)
    // __lookupGetter__ recovers the captured function.
    expect(ObjectPrototypeLookupGetter(target, 'x')).toBe(getter)
    // No setter installed; lookupSetter returns undefined.
    expect(ObjectPrototypeLookupSetter(target, 'x')).toBe(undefined)
  })

  it('Annex B accessors: __defineSetter__ / __lookupSetter__ round-trip', () => {
    const target: { y?: number | undefined } = {}
    let written: unknown
    const setter = (value: unknown): void => {
      written = value
    }
    ObjectPrototypeDefineSetter(target, 'y', setter)
    target.y = 7
    expect(written).toBe(7)
    expect(ObjectPrototypeLookupSetter(target, 'y')).toBe(setter)
    // No getter installed; reading falls through to undefined.
    expect(target.y).toBe(undefined)
    expect(ObjectPrototypeLookupGetter(target, 'y')).toBe(undefined)
  })

  it('__lookupGetter__ walks the prototype chain', () => {
    // Annex B explicitly requires walking up the prototype chain,
    // which is one of the two real reasons to prefer this over
    // Object.getOwnPropertyDescriptor.
    class Parent {
      get prop(): string {
        return 'parent'
      }
    }
    class Child extends Parent {}
    const child = new Child()
    const getter = ObjectPrototypeLookupGetter(child, 'prop')
    expect(typeof getter).toBe('function')
    expect((getter as () => string)?.call(child)).toBe('parent')
  })
})
