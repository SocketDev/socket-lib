/**
 * @file Unit tests for object mutation and sorting utilities:
 *
 *   - Mutation: merge() deep-merge semantics, objectAssign, objectFreeze
 *   - Aliases: objectEntries (direct reference to Object.entries-like behavior)
 *   - Sorting: entryKeyComparator(), toSortedObject(),
 *     toSortedObjectFromEntries() Inspection and predicate tests live in
 *     objects.test.mts; lazy-getter tests live in objects-getters.test.mts.
 */

import { merge, objectAssign, objectFreeze } from '../../src/objects/mutate'
import {
  entryKeyComparator,
  objectEntries,
  toSortedObject,
  toSortedObjectFromEntries,
} from '../../src/objects/sort'

import { describe, expect, it } from 'vitest'

describe('objects - mutate & sort', () => {
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
      expect(objectEntries(undefined)).toEqual([])
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
        ;(frozen as { a: number; b?: number | undefined }).b = 2
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
      expect(merge(undefined as unknown as object, { a: 1 })).toBeUndefined()
      expect(merge({ a: 1 }, undefined as unknown as object)).toEqual({ a: 1 })
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

  describe('merge - additional edge cases', () => {
    it('should handle symbol keys', () => {
      const sym = Symbol('test')
      const target = { a: 1 }
      const source = { [sym]: 'value', b: 2 }
      merge(target, source)
      expect((target as unknown as Record<symbol, string>)[sym]).toBe('value')
      expect((target as { a: number; b: number }).b).toBe(2)
    })

    it('should replace object with array', () => {
      const target = { a: { b: 1 } }
      const source = { a: [1, 2, 3] }
      merge(target, source)
      expect(target.a).toEqual([1, 2, 3])
    })

    it('should replace array with object', () => {
      const target = { a: [1, 2, 3] }
      const source = { a: { b: 1 } }
      merge(target, source)
      expect(target.a).toEqual({ b: 1 })
    })

    it('should handle undefined values', () => {
      const target = { a: { b: 1 } }
      const source = { a: undefined }
      merge(target, source)
      expect(target.a).toBe(undefined)
    })

    it('should handle merging into empty object', () => {
      const target = {}
      const source = { a: 1, b: { c: 2 } }
      merge(target, source)
      expect(target).toEqual({ a: 1, b: { c: 2 } })
    })

    it('should handle deeply nested structures', () => {
      const target = { a: { b: { c: { d: 1 } } } }
      const source = { a: { b: { c: { e: 2 } } } }
      merge(target, source)
      expect(target).toEqual({ a: { b: { c: { d: 1, e: 2 } } } })
    })
  })

  describe('objectEntries - additional tests', () => {
    it('should include non-enumerable properties', () => {
      const obj = { a: 1 }
      Object.defineProperty(obj, 'hidden', {
        value: 'secret',
        enumerable: false,
      })
      const entries = objectEntries(obj)
      expect(entries).toContainEqual(['a', 1])
      expect(entries).toContainEqual(['hidden', 'secret'])
    })

    it('should work with arrays', () => {
      const arr = ['a', 'b']
      const entries = objectEntries(arr)
      expect(entries).toContainEqual(['0', 'a'])
      expect(entries).toContainEqual(['1', 'b'])
      expect(entries).toContainEqual(['length', 2])
    })
  })

  describe('toSortedObject - additional tests', () => {
    it('should handle symbol keys', () => {
      const sym1 = Symbol('z')
      const sym2 = Symbol('a')
      const obj = { z: 1, a: 2, [sym1]: 3, [sym2]: 4 }
      const sorted = toSortedObject(obj)
      expect(sorted[sym1]).toBe(3)
      expect(sorted[sym2]).toBe(4)
      expect((sorted as { a: number }).a).toBe(2)
    })

    it('should handle number keys', () => {
      const obj = { 3: 'three', 1: 'one', 2: 'two' }
      const sorted = toSortedObject(obj)
      const keys = Object.keys(sorted)
      expect(keys).toEqual(['1', '2', '3'])
    })
  })

  describe('toSortedObjectFromEntries - additional tests', () => {
    it('should work with Map entries', () => {
      const map = new Map<PropertyKey, string>([
        ['z', 'last'],
        ['a', 'first'],
        ['m', 'middle'],
      ])
      const sorted = toSortedObjectFromEntries(map)
      expect(Object.keys(sorted)).toEqual(['a', 'm', 'z'])
      expect(sorted).toEqual({ a: 'first', m: 'middle', z: 'last' })
    })

    it('should handle only symbol entries', () => {
      const sym1 = Symbol('first')
      const sym2 = Symbol('second')
      const sorted = toSortedObjectFromEntries([
        [sym2, 2],
        [sym1, 1],
      ])
      expect(sorted[sym1]).toBe(1)
      expect(sorted[sym2]).toBe(2)
    })
  })

  describe('merge - edge cases', () => {
    it('should return target when source is undefined', () => {
      const target = { a: 1 }
      const result = merge(target, undefined as unknown as object)
      expect(result).toBe(target)
    })

    it('should return target when target is undefined', () => {
      const source = { b: 2 }
      const result = merge(undefined as unknown as object, source)
      expect(result).toBe(undefined)
    })

    it('should handle nested null/undefined in merge queue', () => {
      const target = { a: undefined, b: undefined }
      const source = { a: { c: 1 }, b: { d: 2 } }
      const result = merge(target, source)
      // Null/undefined values in the queue should continue without throwing
      expect(result).toMatchObject({ a: { c: 1 }, b: { d: 2 } })
    })

    it('should skip array merging when target has array', () => {
      const target = { a: [1, 2] }
      const source = { a: [3, 4] }
      const result = merge(target, source)
      expect(result.a).toEqual([3, 4])
    })

    it('should skip array merging when source has array', () => {
      const target = { a: { b: 1 } }
      const source = { a: [1, 2] }
      const result = merge(target, source)
      expect(result.a).toEqual([1, 2])
    })
  })
})
