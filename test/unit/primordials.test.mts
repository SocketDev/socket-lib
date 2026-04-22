/**
 * @fileoverview Unit tests for primordials (safe built-in references).
 *
 * Primordials capture references to built-ins at module load time so
 * prototype-pollution attacks on the caller realm can't redirect library
 * internals. These tests verify the captured references:
 *   - still point at the expected built-ins after `Array.prototype.map` etc.
 *     have been clobbered on globalThis;
 *   - preserve semantics when called through the `uncurryThis` wrappers;
 *   - cover the constructor, static-method, prototype-method, and Symbol
 *     categories exported by the module.
 */

import {
  ArrayIsArray,
  ArrayPrototypeFilter,
  ArrayPrototypeJoin,
  ArrayPrototypeMap,
  ArrayPrototypePush,
  JSONParse,
  JSONStringify,
  MapCtor,
  ObjectCreate,
  ObjectEntries,
  ObjectFreeze,
  ObjectKeys,
  ObjectPrototype,
  ObjectPrototypeHasOwnProperty,
  ObjectPrototypeToString,
  ReflectApply,
  ReflectOwnKeys,
  RegExpPrototypeExec,
  RegExpPrototypeTest,
  SetCtor,
  StringFromCharCode,
  StringPrototypeCharCodeAt,
  StringPrototypeIncludes,
  StringPrototypeSlice,
  StringPrototypeSplit,
  SymbolFor,
  SymbolIterator,
  SymbolToStringTag,
  uncurryThis,
  WeakMapCtor,
} from '@socketsecurity/lib/primordials'
import { describe, expect, it } from 'vitest'

describe('primordials', () => {
  describe('constructors', () => {
    it('should expose Map, Set, WeakMap constructors', () => {
      expect(new MapCtor()).toBeInstanceOf(Map)
      expect(new SetCtor()).toBeInstanceOf(Set)
      expect(new WeakMapCtor()).toBeInstanceOf(WeakMap)
    })
  })

  describe('Array', () => {
    it('ArrayIsArray should narrow', () => {
      expect(ArrayIsArray([1, 2])).toBe(true)
      expect(ArrayIsArray({ length: 2 })).toBe(false)
    })

    it('ArrayPrototypeMap / Filter / Join should work via uncurryThis', () => {
      const arr = [1, 2, 3]
      expect(ArrayPrototypeMap(arr, x => x * 2)).toEqual([2, 4, 6])
      expect(ArrayPrototypeFilter(arr, x => x > 1)).toEqual([2, 3])
      expect(ArrayPrototypeJoin(arr, '-')).toBe('1-2-3')
    })

    it('ArrayPrototypePush should return new length', () => {
      const arr: number[] = []
      expect(ArrayPrototypePush(arr, 1, 2, 3)).toBe(3)
      expect(arr).toEqual([1, 2, 3])
    })
  })

  describe('JSON', () => {
    it('JSONParse / JSONStringify round-trip', () => {
      const input = { a: 1, b: [2, 3] }
      expect(JSONParse(JSONStringify(input))).toEqual(input)
    })
  })

  describe('Object', () => {
    it('ObjectKeys / Entries / Freeze / Create', () => {
      expect(ObjectKeys({ a: 1, b: 2 })).toEqual(['a', 'b'])
      expect(ObjectEntries({ a: 1 })).toEqual([['a', 1]])
      const obj = ObjectFreeze({ a: 1 })
      expect(Object.isFrozen(obj)).toBe(true)
      const nullProto = ObjectCreate(null)
      expect(Object.getPrototypeOf(nullProto)).toBe(null)
    })

    it('ObjectPrototype / hasOwn / toString work via uncurry', () => {
      expect(ObjectPrototype).toBe(Object.prototype)
      expect(ObjectPrototypeHasOwnProperty({ a: 1 }, 'a')).toBe(true)
      expect(ObjectPrototypeHasOwnProperty({ a: 1 }, 'b')).toBe(false)
      expect(ObjectPrototypeToString([])).toBe('[object Array]')
      expect(ObjectPrototypeToString(new Error())).toBe('[object Error]')
    })
  })

  describe('Reflect', () => {
    it('ReflectApply should invoke with thisArg + args', () => {
      const fn = function (this: { n: number }, x: number) {
        return this.n + x
      }
      expect(ReflectApply(fn, { n: 10 }, [5])).toBe(15)
    })

    it('ReflectOwnKeys includes symbols', () => {
      const sym = Symbol('s')
      const obj = { a: 1, [sym]: 2 }
      expect(ReflectOwnKeys(obj)).toEqual(['a', sym])
    })
  })

  describe('RegExp', () => {
    it('RegExpPrototypeTest / Exec should preserve semantics', () => {
      expect(RegExpPrototypeTest(/foo/, 'foobar')).toBe(true)
      const match = RegExpPrototypeExec(/(\w+)/, 'abc')
      expect(match?.[1]).toBe('abc')
    })
  })

  describe('String', () => {
    it('StringPrototypeSlice / Split / Includes', () => {
      expect(StringPrototypeSlice('hello', 1, 4)).toBe('ell')
      expect(StringPrototypeSplit('a,b,c', ',')).toEqual(['a', 'b', 'c'])
      expect(StringPrototypeIncludes('hello', 'ell')).toBe(true)
    })

    it('StringPrototypeCharCodeAt / StringFromCharCode', () => {
      expect(StringPrototypeCharCodeAt('A', 0)).toBe(65)
      expect(StringFromCharCode(65, 66, 67)).toBe('ABC')
    })
  })

  describe('Symbol', () => {
    it('SymbolIterator / SymbolToStringTag match globals', () => {
      expect(SymbolIterator).toBe(Symbol.iterator)
      expect(SymbolToStringTag).toBe(Symbol.toStringTag)
    })

    it('SymbolFor returns registry symbols', () => {
      expect(SymbolFor('test.primordials')).toBe(Symbol.for('test.primordials'))
    })
  })

  describe('prototype-pollution resilience', () => {
    it('captures persist even if prototype is clobbered', () => {
      const savedMap = Array.prototype.map
      try {
        // Simulate an attacker replacing Array.prototype.map.
        ;(Array.prototype as { map: unknown }).map = function clobbered() {
          throw new Error('should not be called')
        }
        // Our captured ArrayPrototypeMap should still work.
        expect(ArrayPrototypeMap([1, 2, 3], (x: number) => x + 1)).toEqual([
          2, 3, 4,
        ])
      } finally {
        ;(Array.prototype as { map: typeof savedMap }).map = savedMap
      }
    })

    it('captures persist even if static is clobbered', () => {
      const savedIsArray = Array.isArray
      try {
        ;(Array as { isArray: unknown }).isArray = () => false
        expect(ArrayIsArray([1, 2])).toBe(true)
      } finally {
        ;(Array as { isArray: typeof savedIsArray }).isArray = savedIsArray
      }
    })
  })

  describe('uncurryThis', () => {
    it('exposes the uncurryThis helper for callers building their own', () => {
      const upper = uncurryThis(String.prototype.toUpperCase)
      expect(upper('abc')).toBe('ABC')
    })
  })
})
