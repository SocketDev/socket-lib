/**
 * @file Unit tests for lazy-getter and constants-object utilities from
 *   src/objects/getters. Covers createLazyGetter(), defineGetter(),
 *   defineLazyGetter(), defineLazyGetters(), and createConstantsObject().
 *   Tests validate lazy evaluation, memoization, stats tracking, symbol/number
 *   property keys, and frozen-constants behavior. Lazy getters are critical for
 *   performance - deferring expensive computations until needed.
 */

import {
  createConstantsObject,
  createLazyGetter,
  defineGetter,
  defineLazyGetter,
  defineLazyGetters,
} from '../../src/objects/getters'

import type { GetterDefObj } from '../../src/objects/types'
import { describe, expect, it } from 'vitest'

describe('objects - getters', () => {
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

  describe('createConstantsObject', () => {
    it('should create a frozen object with properties', () => {
      const obj = createConstantsObject({ a: 1, b: 2 })
      expect(Object.isFrozen(obj)).toBe(true)
      expect((obj as { a: number }).a).toBe(1)
    })

    it('should create object with lazy getters', () => {
      let callCount = 0
      const obj = createConstantsObject(
        { base: 'value' },
        {
          getters: {
            computed: () => {
              callCount += 1
              return 'result'
            },
          },
        },
      )
      expect(callCount).toBe(0)
      expect((obj as { computed: string }).computed).toBe('result')
      expect(callCount).toBe(1)
      expect((obj as { computed: string }).computed).toBe('result')
      expect(callCount).toBe(1)
    })

    it('should create object with mixin properties', () => {
      const obj = createConstantsObject(
        { a: 1 },
        {
          mixin: {
            b: 2,
            c: 3,
          },
        },
      )
      expect((obj as { a: number; b: number; c: number }).a).toBe(1)
      expect((obj as { a: number; b: number; c: number }).b).toBe(2)
      expect((obj as { a: number; b: number; c: number }).c).toBe(3)
    })

    it('should not override props with mixin', () => {
      const obj = createConstantsObject(
        { a: 1, b: 2 },
        {
          mixin: {
            b: 99,
            c: 3,
          },
        },
      )
      expect((obj as { a: number; b: number; c: number }).a).toBe(1)
      expect((obj as { a: number; b: number; c: number }).b).toBe(2)
      expect((obj as { a: number; b: number; c: number }).c).toBe(3)
    })

    it('should handle undefined options', () => {
      const obj = createConstantsObject({ a: 1 }, undefined)
      expect((obj as { a: number }).a).toBe(1)
      expect(Object.isFrozen(obj)).toBe(true)
    })
  })

  describe('defineLazyGetters', () => {
    it('should define multiple lazy getters', () => {
      const obj = {}
      let count1 = 0
      let count2 = 0

      defineLazyGetters(obj, {
        prop1: () => {
          count1 += 1
          return 'value1'
        },
        prop2: () => {
          count2 += 1
          return 'value2'
        },
      })

      expect(count1).toBe(0)
      expect(count2).toBe(0)
      expect((obj as { prop1: string }).prop1).toBe('value1')
      expect(count1).toBe(1)
      expect(count2).toBe(0)
      expect((obj as { prop2: string }).prop2).toBe('value2')
      expect(count1).toBe(1)
      expect(count2).toBe(1)
    })

    it('should handle undefined getterDefObj', () => {
      const obj = {}
      const result = defineLazyGetters(obj, undefined)
      expect(result).toBe(obj)
    })

    it('should handle null getterDefObj', () => {
      const obj = {}
      const result = defineLazyGetters(
        obj,
        undefined as unknown as GetterDefObj,
      )
      expect(result).toBe(obj)
    })

    it('should handle symbol keys in getters', () => {
      const obj = {}
      const sym = Symbol('test')
      defineLazyGetters(obj, {
        [sym]: () => 'symbol-value',
      })
      expect((obj as { [key: symbol]: string })[sym]).toBe('symbol-value')
    })

    it('should handle empty getter object', () => {
      const obj = {}
      defineLazyGetters(obj, {})
      expect(obj).toEqual({})
    })
  })

  describe('defineGetter - additional tests', () => {
    it('should create non-enumerable getter', () => {
      const obj = {}
      defineGetter(obj, 'test', () => 'value')
      expect(Object.keys(obj)).toEqual([])
      expect(Object.getOwnPropertyNames(obj)).toContain('test')
    })

    it('should work with symbol keys', () => {
      const obj = {}
      const sym = Symbol('test')
      defineGetter(obj, sym, () => 'symbol-value')
      expect((obj as { [key: symbol]: string })[sym]).toBe('symbol-value')
    })
  })

  describe('defineLazyGetter - additional tests', () => {
    it('should work with symbol keys', () => {
      const obj = {}
      const sym = Symbol('lazy')
      let called = false
      defineLazyGetter(obj, sym, () => {
        called = true
        return 'value'
      })

      expect(called).toBe(false)
      expect((obj as { [key: symbol]: string })[sym]).toBe('value')
      expect(called).toBe(true)
    })

    it('should be non-enumerable', () => {
      const obj = { regular: 'prop' }
      defineLazyGetter(obj, 'lazy', () => 'value')
      expect(Object.keys(obj)).toEqual(['regular'])
    })
  })

  describe('createLazyGetter - additional tests', () => {
    it('should work with symbol property names', () => {
      const sym = Symbol('myProp')
      const stats = { initialized: new Set<PropertyKey>() }
      const getter = createLazyGetter(sym, () => 'value', stats)

      expect(stats.initialized.has(sym)).toBe(false)
      expect(getter()).toBe('value')
      expect(stats.initialized.has(sym)).toBe(true)
    })

    it('should work with number property names', () => {
      const stats = { initialized: new Set<PropertyKey>() }
      const getter = createLazyGetter(123, () => 'value', stats)

      expect(stats.initialized.has(123)).toBe(false)
      expect(getter()).toBe('value')
      expect(stats.initialized.has(123)).toBe(true)
    })

    it('should memoize falsy values', () => {
      let callCount = 0
      const getter = createLazyGetter('test', () => {
        callCount += 1
        return 0
      })

      expect(getter()).toBe(0)
      expect(callCount).toBe(1)
      expect(getter()).toBe(0)
      expect(callCount).toBe(1)
    })

    it('should memoize undefined values', () => {
      let callCount = 0
      const getter = createLazyGetter('test', () => {
        callCount += 1
        return undefined
      })

      expect(getter()).toBeUndefined()
      expect(callCount).toBe(1)
      expect(getter()).toBeUndefined()
      expect(callCount).toBe(1)
    })
  })

  describe('createConstantsObject - additional tests', () => {
    it('should handle getters with lazyGetterStats tracking', () => {
      const obj = createConstantsObject(
        {},
        {
          getters: {
            computed: () => 'value',
          },
        },
      )
      // Access the getter
      expect((obj as Record<PropertyKey, unknown>).computed).toBe('value')
      // Accessing again should still work (memoized)
      expect((obj as Record<PropertyKey, unknown>).computed).toBe('value')
    })

    it('should handle multiple lazy getters', () => {
      const obj = createConstantsObject(
        { base: 1 },
        {
          getters: {
            first: () => 'one',
            second: () => 'two',
          },
        },
      )
      expect((obj as Record<PropertyKey, unknown>).first).toBe('one')
      expect((obj as Record<PropertyKey, unknown>).second).toBe('two')
      expect((obj as Record<PropertyKey, unknown>).base).toBe(1)
    })

    it('should memoize lazy getter results across multiple accesses', () => {
      let count = 0
      const obj = createConstantsObject(
        {},
        {
          getters: {
            counter: () => ++count,
          },
        },
      )
      expect((obj as Record<PropertyKey, unknown>).counter).toBe(1)
      expect((obj as Record<PropertyKey, unknown>).counter).toBe(1) // Should return cached value
      expect(count).toBe(1) // Function only called once
    })

    it('should provide access to internal attributes and stats', () => {
      const obj = createConstantsObject(
        { a: 1 },
        {
          getters: {
            computed: () => 'value',
          },
        },
      )
      const objWithSymbol = obj as Record<PropertyKey, unknown>
      const internals = objWithSymbol['kInternalsSymbol'] as PropertyKey
      const internalsObj = objWithSymbol[internals] as Record<
        PropertyKey,
        unknown
      >
      // Access attributes getter
      expect(internalsObj['attributes']).toBeDefined()
      // Access lazyGetterStats getter
      expect(internalsObj['lazyGetterStats']).toBeDefined()
    })
  })
})
