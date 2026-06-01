/**
 * @file Unit tests for object inspection and predicate utilities:
 *
 *   - Property access: getOwn(), hasOwn(), getKeys(), hasKeys(),
 *     getOwnPropertyValues()
 *   - Type guards: isObject(), isPlainObject() (excludes arrays/null) Mutation
 *     and sorting tests live in objects-mutate-sort.test.mts; lazy-getter and
 *     constants-object tests live in objects-getters.test.mts. Tests validate
 *     type narrowing and edge cases (symbol/number keys, non-enumerable
 *     properties, prototype chains).
 */

import {
  getKeys,
  getOwn,
  getOwnPropertyValues,
} from '../../src/objects/inspect'
import {
  hasKeys,
  hasOwn,
  isObject,
  isPlainObject,
} from '../../src/objects/predicates'

import { describe, expect, it } from 'vitest'

describe('objects - inspect & predicates', () => {
  describe('getKeys', () => {
    it('should return enumerable own keys', () => {
      const obj = { a: 1, b: 2, c: 3 }
      const keys = getKeys(obj)
      expect(keys).toEqual(['a', 'b', 'c'])
    })

    it('should return empty array for non-objects', () => {
      expect(getKeys(undefined)).toEqual([])
      expect(getKeys(undefined)).toEqual([])
      expect(getKeys(123)).toEqual([])
      expect(getKeys('string')).toEqual([])
    })

    it('should return empty array for objects without keys', () => {
      expect(getKeys({})).toEqual([])
    })
  })

  describe('getOwn', () => {
    it('should get own property value', () => {
      const obj = { a: 1, b: 2 }
      expect(getOwn(obj, 'a')).toBe(1)
      expect(getOwn(obj, 'b')).toBe(2)
    })

    it('should return undefined for non-existent properties', () => {
      const obj = { a: 1 }
      expect(getOwn(obj, 'b')).toBeUndefined()
    })

    it('should return undefined for null/undefined', () => {
      expect(getOwn(undefined, 'a')).toBeUndefined()
      expect(getOwn(undefined, 'a')).toBeUndefined()
    })

    it('should not access prototype properties', () => {
      const proto = { inherited: 'value' }
      const obj = Object.create(proto)
      obj.own = 'owned'
      expect(getOwn(obj, 'own')).toBe('owned')
      expect(getOwn(obj, 'inherited')).toBeUndefined()
    })
  })

  describe('getOwnPropertyValues', () => {
    it('should return all own property values', () => {
      const obj = { a: 1, b: 2, c: 3 }
      const values = getOwnPropertyValues(obj)
      expect(values).toContain(1)
      expect(values).toContain(2)
      expect(values).toContain(3)
      expect(values).toHaveLength(3)
    })

    it('should return empty array for null/undefined', () => {
      expect(getOwnPropertyValues(undefined)).toEqual([])
      expect(getOwnPropertyValues(undefined)).toEqual([])
    })

    it('should return empty array for objects without properties', () => {
      expect(getOwnPropertyValues({})).toEqual([])
    })
  })

  describe('hasKeys', () => {
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
  })

  describe('hasOwn', () => {
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
  })

  describe('isObject', () => {
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
  })

  describe('isPlainObject', () => {
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
  })

  describe('getKeys - additional tests', () => {
    it('should work with arrays', () => {
      const arr = ['a', 'b', 'c']
      const keys = getKeys(arr)
      expect(keys).toEqual(['0', '1', '2'])
    })
  })

  describe('getOwn - additional tests', () => {
    it('should handle symbol keys', () => {
      const sym = Symbol('test')
      const obj = { [sym]: 'value' }
      expect(getOwn(obj, sym)).toBe('value')
    })

    it('should handle number keys', () => {
      const obj = { 123: 'value' }
      expect(getOwn(obj, 123)).toBe('value')
    })

    it('should handle arrays', () => {
      const arr = ['a', 'b', 'c']
      expect(getOwn(arr, 0)).toBe('a')
      expect(getOwn(arr, '1')).toBe('b')
      expect(getOwn(arr, 'length')).toBe(3)
    })
  })

  describe('getOwnPropertyValues - additional tests', () => {
    it('should include non-enumerable properties', () => {
      const obj = { a: 1 }
      Object.defineProperty(obj, 'hidden', {
        value: 'secret',
        enumerable: false,
      })
      const values = getOwnPropertyValues(obj)
      expect(values).toContain(1)
      expect(values).toContain('secret')
    })
  })

  describe('hasOwn - additional tests', () => {
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

  describe('isPlainObject - additional tests', () => {
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

  describe('isObject - additional tests', () => {
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

  describe('hasKeys - additional tests', () => {
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
})
