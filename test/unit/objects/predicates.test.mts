import { describe, expect, it } from 'vitest'

import {
  hasKeys,
  hasOwn,
  isObject,
  isPlainObject,
} from '../../../src/objects/predicates'

describe('objects/predicates — hasKeys', () => {
  it('should return true for objects with keys', () => {
    expect(hasKeys({ a: 1 })).toBe(true)
    expect(hasKeys({ a: 1, b: 2 })).toBe(true)
  })

  it('should return false for empty objects', () => {
    expect(hasKeys({})).toBe(false)
  })

  it('should return false for null/undefined', () => {
    expect(hasKeys(undefined)).toBe(false)
    expect(hasKeys(undefined)).toBe(false)
  })

  it('should only check enumerable own properties', () => {
    const obj = Object.create({ inherited: 1 })
    expect(hasKeys(obj)).toBe(false)
    obj.own = 1
    expect(hasKeys(obj)).toBe(true)
  })

  it('should return true for arrays with elements', () => {
    expect(hasKeys([1, 2, 3])).toBe(true)
  })

  it('should return false for empty arrays', () => {
    expect(hasKeys([])).toBe(false)
  })

  it('should return false for objects with only non-enumerable properties', () => {
    const obj = {}
    Object.defineProperty(obj, 'hidden', {
      value: 'secret',
      enumerable: false,
    })
    expect(hasKeys(obj)).toBe(false)
  })
})

describe('objects/predicates — hasOwn', () => {
  it('should return true for own properties', () => {
    const obj = { a: 1, b: 2 }
    expect(hasOwn(obj, 'a')).toBe(true)
    expect(hasOwn(obj, 'b')).toBe(true)
  })

  it('should return false for non-existent properties', () => {
    const obj = { a: 1 }
    expect(hasOwn(obj, 'b')).toBe(false)
  })

  it('should return false for null/undefined', () => {
    expect(hasOwn(undefined, 'a')).toBe(false)
    expect(hasOwn(undefined, 'a')).toBe(false)
  })

  it('should not detect inherited properties', () => {
    const proto = { inherited: 1 }
    const obj = Object.create(proto)
    expect(hasOwn(obj, 'inherited')).toBe(false)
  })

  it('should work with symbol keys', () => {
    const sym = Symbol('test')
    const obj = { [sym]: 'value' }
    expect(hasOwn(obj, sym)).toBe(true)
    expect(hasOwn(obj, Symbol('other'))).toBe(false)
  })

  it('should work with arrays', () => {
    const arr = ['a', 'b', 'c']
    expect(hasOwn(arr, 0)).toBe(true)
    expect(hasOwn(arr, 3)).toBe(false)
    expect(hasOwn(arr, 'length')).toBe(true)
  })

  it('should handle non-enumerable properties', () => {
    const obj = {}
    Object.defineProperty(obj, 'hidden', {
      value: 'secret',
      enumerable: false,
    })
    expect(hasOwn(obj, 'hidden')).toBe(true)
  })
})

describe('objects/predicates — isObject', () => {
  it('should return true for objects', () => {
    expect(isObject({})).toBe(true)
    expect(isObject({ a: 1 })).toBe(true)
    expect(isObject([])).toBe(true)
    expect(isObject(new Date())).toBe(true)
  })

  it('should return false for primitives', () => {
    expect(isObject(undefined)).toBe(false)
    expect(isObject(undefined)).toBe(false)
    expect(isObject(123)).toBe(false)
    expect(isObject('string')).toBe(false)
    expect(isObject(true)).toBe(false)
  })

  it('should return true for class instances', () => {
    class MyClass {}
    expect(isObject(new MyClass())).toBe(true)
  })

  it('should return true for RegExp', () => {
    expect(isObject(/test/)).toBe(true)
  })

  it('should return false for symbols', () => {
    expect(isObject(Symbol('test'))).toBe(false)
  })
})

describe('objects/predicates — isPlainObject', () => {
  it('should return true for plain objects', () => {
    expect(isPlainObject({})).toBe(true)
    expect(isPlainObject({ a: 1 })).toBe(true)
    expect(isPlainObject(Object.create(null))).toBe(true)
  })

  it('should return false for arrays', () => {
    expect(isPlainObject([])).toBe(false)
    expect(isPlainObject([1, 2, 3])).toBe(false)
  })

  it('should return false for other objects', () => {
    expect(isPlainObject(new Date())).toBe(false)
    expect(isPlainObject(new Map())).toBe(false)
    expect(isPlainObject(new Set())).toBe(false)
  })

  it('should return false for primitives', () => {
    expect(isPlainObject(undefined)).toBe(false)
    expect(isPlainObject(undefined)).toBe(false)
    expect(isPlainObject(123)).toBe(false)
  })

  it('should return false for RegExp', () => {
    expect(isPlainObject(/test/)).toBe(false)
  })

  it('should return false for Error', () => {
    expect(isPlainObject(new Error())).toBe(false)
  })

  it('should return true for Object.create(Object.prototype)', () => {
    expect(isPlainObject(Object.create(Object.prototype))).toBe(true)
  })

  it('should return false for objects with custom prototypes', () => {
    const proto = { custom: true }
    const obj = Object.create(proto)
    expect(isPlainObject(obj)).toBe(false)
  })
})
