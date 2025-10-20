/**
 * @fileoverview Unit tests for object manipulation utilities.
 */

import { describe, expect, it } from 'vitest'
import {
  createLazyGetter,
  defineGetter,
  defineLazyGetter,
  entryKeyComparator,
  getKeys,
  getOwn,
  getOwnPropertyValues,
  hasKeys,
  hasOwn,
  isObject,
  isObjectObject,
  merge,
  objectAssign,
  objectEntries,
  objectFreeze,
  toSortedObject,
  toSortedObjectFromEntries,
} from '@socketsecurity/lib/objects'

describe('objects', () => {
  describe('createLazyGetter', () => {
    it('should create a lazy getter that memoizes result', () => {
      let callCount = 0
      const getter = createLazyGetter('test', () => {
        callCount += 1
        return 'computed'
      })

      expect(callCount).toBe(0)
      expect(getter()).toBe('computed')
      expect(callCount).toBe(1)
      expect(getter()).toBe('computed')
      expect(callCount).toBe(1) // Should not call again
    })

    it('should track initialization in stats', () => {
      const stats = { initialized: new Set<PropertyKey>() }
      const getter = createLazyGetter('myProp', () => 'value', stats)

      expect(stats.initialized.has('myProp')).toBe(false)
      getter()
      expect(stats.initialized.has('myProp')).toBe(true)
    })
  })

  describe('defineGetter', () => {
    it('should define a getter property', () => {
      const obj = {}
      defineGetter(obj, 'test', () => 'value')

      expect((obj as { test: string }).test).toBe('value')
    })

    it('should return the object', () => {
      const obj = {}
      const result = defineGetter(obj, 'test', () => 'value')
      expect(result).toBe(obj)
    })
  })

  describe('defineLazyGetter', () => {
    it('should define a lazy getter property', () => {
      const obj = {}
      let callCount = 0
      defineLazyGetter(obj, 'test', () => {
        callCount += 1
        return 'value'
      })

      expect(callCount).toBe(0)
      expect((obj as { test: string }).test).toBe('value')
      expect(callCount).toBe(1)
      expect((obj as { test: string }).test).toBe('value')
      expect(callCount).toBe(1)
    })
  })

  describe('entryKeyComparator', () => {
    it('should compare entry keys alphabetically', () => {
      expect(entryKeyComparator(['a', 1], ['b', 2])).toBeLessThan(0)
      expect(entryKeyComparator(['b', 1], ['a', 2])).toBeGreaterThan(0)
      expect(entryKeyComparator(['a', 1], ['a', 2])).toBe(0)
    })

    it('should handle symbol keys', () => {
      const sym1 = Symbol('a')
      const sym2 = Symbol('b')
      const result = entryKeyComparator([sym1, 1], [sym2, 2])
      expect(typeof result).toBe('number')
    })

    it('should handle number keys', () => {
      expect(entryKeyComparator([1, 'a'], [2, 'b'])).toBeLessThan(0)
      expect(entryKeyComparator([2, 'a'], [1, 'b'])).toBeGreaterThan(0)
    })
  })

  describe('getKeys', () => {
    it('should return enumerable own keys', () => {
      const obj = { a: 1, b: 2, c: 3 }
      const keys = getKeys(obj)
      expect(keys).toEqual(['a', 'b', 'c'])
    })

    it('should return empty array for non-objects', () => {
      expect(getKeys(null)).toEqual([])
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
      expect(getOwn(null, 'a')).toBeUndefined()
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
      expect(getOwnPropertyValues(null)).toEqual([])
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
      expect(hasKeys(null)).toBe(false)
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
      expect(hasOwn(null, 'a')).toBe(false)
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
      expect(isObject(null)).toBe(false)
      expect(isObject(undefined)).toBe(false)
      expect(isObject(123)).toBe(false)
      expect(isObject('string')).toBe(false)
      expect(isObject(true)).toBe(false)
    })
  })

  describe('isObjectObject', () => {
    it('should return true for plain objects', () => {
      expect(isObjectObject({})).toBe(true)
      expect(isObjectObject({ a: 1 })).toBe(true)
      expect(isObjectObject(Object.create(null))).toBe(true)
    })

    it('should return false for arrays', () => {
      expect(isObjectObject([])).toBe(false)
      expect(isObjectObject([1, 2, 3])).toBe(false)
    })

    it('should return false for other objects', () => {
      expect(isObjectObject(new Date())).toBe(false)
      expect(isObjectObject(new Map())).toBe(false)
      expect(isObjectObject(new Set())).toBe(false)
    })

    it('should return false for primitives', () => {
      expect(isObjectObject(null)).toBe(false)
      expect(isObjectObject(undefined)).toBe(false)
      expect(isObjectObject(123)).toBe(false)
    })
  })

  describe('objectAssign', () => {
    it('should copy properties from source to target', () => {
      const target = { a: 1 }
      const source = { b: 2, c: 3 }
      const result = objectAssign(target, source)
      expect(result).toBe(target)
      expect(result).toEqual({ a: 1, b: 2, c: 3 })
    })

    it('should handle multiple sources', () => {
      const result = objectAssign({}, { a: 1 }, { b: 2 }, { c: 3 })
      expect(result).toEqual({ a: 1, b: 2, c: 3 })
    })

    it('should overwrite existing properties', () => {
      const result = objectAssign({ a: 1 }, { a: 2 })
      expect(result).toEqual({ a: 2 })
    })
  })

  describe('objectEntries', () => {
    it('should return entries for objects', () => {
      const obj = { a: 1, b: 2 }
      const entries = objectEntries(obj)
      expect(entries).toContainEqual(['a', 1])
      expect(entries).toContainEqual(['b', 2])
    })

    it('should return empty array for null/undefined', () => {
      expect(objectEntries(null)).toEqual([])
      expect(objectEntries(undefined)).toEqual([])
    })

    it('should include symbol keys', () => {
      const sym = Symbol('test')
      const obj = { [sym]: 'value', a: 1 }
      const entries = objectEntries(obj)
      expect(entries).toContainEqual([sym, 'value'])
      expect(entries).toContainEqual(['a', 1])
    })
  })

  describe('objectFreeze', () => {
    it('should freeze an object', () => {
      const obj = { a: 1 }
      const frozen = objectFreeze(obj)
      expect(Object.isFrozen(frozen)).toBe(true)
    })

    it('should prevent modifications', () => {
      const obj = { a: 1 }
      const frozen = objectFreeze(obj)
      expect(() => {
        ;(frozen as { a: number; b?: number }).b = 2
      }).toThrow()
    })
  })

  describe('merge', () => {
    it('should deep merge objects', () => {
      const target = { a: 1, b: { c: 2 } }
      const source = { b: { d: 3 }, e: 4 }
      const result = merge(target, source)
      expect(result).toEqual({ a: 1, b: { c: 2, d: 3 }, e: 4 })
    })

    it('should replace arrays instead of merging', () => {
      const target = { a: [1, 2] }
      const source = { a: [3, 4] }
      const result = merge(target, source)
      expect(result).toEqual({ a: [3, 4] })
    })

    it('should handle nested objects', () => {
      const target = { a: { b: { c: 1 } } }
      const source = { a: { b: { d: 2 } } }
      const result = merge(target, source)
      expect(result).toEqual({ a: { b: { c: 1, d: 2 } } })
    })

    it('should handle non-object inputs', () => {
      expect(merge(null as unknown as object, { a: 1 })).toBeNull()
      expect(merge({ a: 1 }, null as unknown as object)).toEqual({ a: 1 })
    })
  })

  describe('toSortedObject', () => {
    it('should sort object keys alphabetically', () => {
      const obj = { c: 3, a: 1, b: 2 }
      const sorted = toSortedObject(obj)
      expect(Object.keys(sorted)).toEqual(['a', 'b', 'c'])
    })

    it('should preserve values', () => {
      const obj = { c: 3, a: 1, b: 2 }
      const sorted = toSortedObject(obj)
      expect(sorted).toEqual({ a: 1, b: 2, c: 3 })
    })

    it('should handle empty objects', () => {
      const sorted = toSortedObject({})
      expect(sorted).toEqual({})
    })
  })

  describe('toSortedObjectFromEntries', () => {
    it('should create sorted object from entries', () => {
      const entries: Array<[PropertyKey, number]> = [
        ['c', 3],
        ['a', 1],
        ['b', 2],
      ]
      const sorted = toSortedObjectFromEntries(entries)
      expect(Object.keys(sorted)).toEqual(['a', 'b', 'c'])
      expect(sorted).toEqual({ a: 1, b: 2, c: 3 })
    })

    it('should handle symbol keys', () => {
      const sym1 = Symbol('a')
      const sym2 = Symbol('b')
      const entries: Array<[PropertyKey, number]> = [
        [sym2, 2],
        ['a', 1],
        [sym1, 3],
      ]
      const sorted = toSortedObjectFromEntries(entries)
      expect(sorted).toHaveProperty('a')
      expect(sorted[sym1]).toBe(3)
      expect(sorted[sym2]).toBe(2)
    })

    it('should handle empty entries', () => {
      const sorted = toSortedObjectFromEntries([])
      expect(sorted).toEqual({})
    })
  })
})
