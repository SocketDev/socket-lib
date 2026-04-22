/**
 * @fileoverview Unit tests for primordials (safe built-in references).
 *
 * Primordials capture references to built-ins at module load time so
 * prototype-pollution attacks on the caller realm can't redirect library
 * internals. These tests verify:
 *   - every exported symbol resolves to the expected built-in;
 *   - uncurried prototype methods preserve semantics when called with
 *     `self` as the first argument;
 *   - captures persist even after `Array.prototype.map`, `Array.isArray`,
 *     `Object.keys`, `String.prototype.slice`, or `JSON.parse` are
 *     clobbered on globalThis;
 *   - the `uncurryThis` / `applyBind` helpers are exposed for callers
 *     building their own captures.
 */

import {
  applyBind,
  ArrayCtor,
  ArrayFrom,
  ArrayIsArray,
  ArrayOf,
  ArrayPrototypeAt,
  ArrayPrototypeConcat,
  ArrayPrototypeCopyWithin,
  ArrayPrototypeEntries,
  ArrayPrototypeEvery,
  ArrayPrototypeFill,
  ArrayPrototypeFilter,
  ArrayPrototypeFind,
  ArrayPrototypeFindIndex,
  ArrayPrototypeFindLast,
  ArrayPrototypeFindLastIndex,
  ArrayPrototypeFlat,
  ArrayPrototypeFlatMap,
  ArrayPrototypeForEach,
  ArrayPrototypeIncludes,
  ArrayPrototypeIndexOf,
  ArrayPrototypeJoin,
  ArrayPrototypeKeys,
  ArrayPrototypeLastIndexOf,
  ArrayPrototypeMap,
  ArrayPrototypePop,
  ArrayPrototypePush,
  ArrayPrototypeReduce,
  ArrayPrototypeReduceRight,
  ArrayPrototypeReverse,
  ArrayPrototypeShift,
  ArrayPrototypeSlice,
  ArrayPrototypeSome,
  ArrayPrototypeSort,
  ArrayPrototypeSplice,
  ArrayPrototypeToReversed,
  ArrayPrototypeToSorted,
  ArrayPrototypeUnshift,
  ArrayPrototypeValues,
  BooleanCtor,
  DateCtor,
  decodeComponent,
  encodeComponent,
  ErrorCtor,
  FunctionPrototypeApply,
  FunctionPrototypeBind,
  FunctionPrototypeCall,
  JSONParse,
  JSONStringify,
  MapCtor,
  MathAbs,
  MathCeil,
  MathFloor,
  MathMax,
  MathMin,
  MathPow,
  MathRandom,
  MathRound,
  MathSign,
  MathSqrt,
  MathTrunc,
  NumberCtor,
  NumberIsFinite,
  NumberIsInteger,
  NumberIsNaN,
  NumberIsSafeInteger,
  NumberParseFloat,
  NumberParseInt,
  NumberPrototypeToFixed,
  NumberPrototypeToString,
  ObjectAssign,
  ObjectCreate,
  ObjectCtor,
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
  ObjectPrototypeHasOwnProperty,
  ObjectPrototypeIsPrototypeOf,
  ObjectPrototypePropertyIsEnumerable,
  ObjectPrototypeToString,
  ObjectPrototypeValueOf,
  ObjectSeal,
  ObjectSetPrototypeOf,
  ObjectValues,
  PromiseCtor,
  ReflectApply,
  ReflectConstruct,
  ReflectDefineProperty,
  ReflectDeleteProperty,
  ReflectGet,
  ReflectGetOwnPropertyDescriptor,
  ReflectGetPrototypeOf,
  ReflectHas,
  ReflectIsExtensible,
  ReflectOwnKeys,
  ReflectPreventExtensions,
  ReflectSet,
  ReflectSetPrototypeOf,
  RegExpCtor,
  RegExpPrototypeExec,
  RegExpPrototypeSymbolMatch,
  RegExpPrototypeSymbolReplace,
  RegExpPrototypeTest,
  SetCtor,
  StringCtor,
  StringFromCharCode,
  StringFromCodePoint,
  StringPrototypeAt,
  StringPrototypeCharAt,
  StringPrototypeCharCodeAt,
  StringPrototypeCodePointAt,
  StringPrototypeConcat,
  StringPrototypeEndsWith,
  StringPrototypeIncludes,
  StringPrototypeIndexOf,
  StringPrototypeLastIndexOf,
  StringPrototypeLocaleCompare,
  StringPrototypeMatch,
  StringPrototypeMatchAll,
  StringPrototypeNormalize,
  StringPrototypePadEnd,
  StringPrototypePadStart,
  StringPrototypeRepeat,
  StringPrototypeReplace,
  StringPrototypeReplaceAll,
  StringPrototypeSearch,
  StringPrototypeSlice,
  StringPrototypeSplit,
  StringPrototypeStartsWith,
  StringPrototypeSubstring,
  StringPrototypeToLocaleLowerCase,
  StringPrototypeToLocaleUpperCase,
  StringPrototypeToLowerCase,
  StringPrototypeToUpperCase,
  StringPrototypeTrim,
  StringPrototypeTrimEnd,
  StringPrototypeTrimStart,
  StringRaw,
  SymbolAsyncIterator,
  SymbolCtor,
  SymbolFor,
  SymbolIterator,
  SymbolToPrimitive,
  SymbolToStringTag,
  uncurryThis,
  URLCtor,
  URLSearchParamsCtor,
  WeakMapCtor,
  WeakRefCtor,
  WeakSetCtor,
} from '@socketsecurity/lib/primordials'
import { describe, expect, it } from 'vitest'

describe('primordials', () => {
  describe('constructors', () => {
    it('points at the JavaScript global constructors', () => {
      expect(ArrayCtor).toBe(Array)
      expect(BooleanCtor).toBe(Boolean)
      expect(DateCtor).toBe(Date)
      expect(ErrorCtor).toBe(Error)
      expect(MapCtor).toBe(Map)
      expect(NumberCtor).toBe(Number)
      expect(ObjectCtor).toBe(Object)
      expect(PromiseCtor).toBe(Promise)
      expect(RegExpCtor).toBe(RegExp)
      expect(SetCtor).toBe(Set)
      expect(StringCtor).toBe(String)
      expect(SymbolCtor).toBe(Symbol)
      expect(URLCtor).toBe(URL)
      expect(URLSearchParamsCtor).toBe(URLSearchParams)
      expect(WeakMapCtor).toBe(WeakMap)
      expect(WeakRefCtor).toBe(WeakRef)
      expect(WeakSetCtor).toBe(WeakSet)
    })

    it('constructs usable instances', () => {
      expect(new ArrayCtor(3)).toHaveLength(3)
      expect(new MapCtor([['a', 1]]).get('a')).toBe(1)
      expect(new SetCtor([1, 2, 2]).size).toBe(2)
      expect(new DateCtor(0).getTime()).toBe(0)
      expect(new URLCtor('https://example.com').hostname).toBe('example.com')
      expect(new ErrorCtor('boom').message).toBe('boom')
    })
  })

  describe('global functions', () => {
    it('decodeComponent / encodeComponent round-trip', () => {
      const raw = 'hello world!'
      expect(decodeComponent(encodeComponent(raw))).toBe(raw)
    })
  })

  describe('JSON', () => {
    it('JSONParse and JSONStringify preserve the built-in behavior', () => {
      const obj = { a: 1, b: [2, 3], c: { d: 'x' } }
      expect(JSONParse(JSONStringify(obj))).toEqual(obj)
      expect(JSONParse).toBe(JSON.parse)
      expect(JSONStringify).toBe(JSON.stringify)
    })
  })

  describe('Array (static)', () => {
    it('ArrayFrom converts array-likes and iterables', () => {
      expect(ArrayFrom('abc')).toEqual(['a', 'b', 'c'])
      expect(ArrayFrom({ length: 3, 0: 'a', 1: 'b', 2: 'c' })).toEqual([
        'a',
        'b',
        'c',
      ])
    })

    it('ArrayIsArray narrows correctly', () => {
      expect(ArrayIsArray([1, 2])).toBe(true)
      expect(ArrayIsArray({ length: 2 })).toBe(false)
      expect(ArrayIsArray('abc')).toBe(false)
    })

    it('ArrayOf composes from args', () => {
      expect(ArrayOf(1, 2, 3)).toEqual([1, 2, 3])
    })
  })

  describe('Array (prototype)', () => {
    it('ArrayPrototypeAt supports negative indexing', () => {
      expect(ArrayPrototypeAt([1, 2, 3], -1)).toBe(3)
      expect(ArrayPrototypeAt([1, 2, 3], 0)).toBe(1)
    })

    it('ArrayPrototypeConcat merges arrays', () => {
      expect(ArrayPrototypeConcat([1], [2, 3], [4])).toEqual([1, 2, 3, 4])
    })

    it('ArrayPrototypeCopyWithin mutates in place', () => {
      const arr = [1, 2, 3, 4, 5]
      ArrayPrototypeCopyWithin(arr, 0, 3)
      expect(arr).toEqual([4, 5, 3, 4, 5])
    })

    it('ArrayPrototypeEntries yields index/value pairs', () => {
      expect([...ArrayPrototypeEntries(['a', 'b'])]).toEqual([
        [0, 'a'],
        [1, 'b'],
      ])
    })

    it('ArrayPrototypeEvery / Some behave correctly', () => {
      expect(ArrayPrototypeEvery([1, 2, 3], (x: number) => x > 0)).toBe(true)
      expect(ArrayPrototypeEvery([1, -2, 3], (x: number) => x > 0)).toBe(false)
      expect(ArrayPrototypeSome([1, 2], (x: number) => x > 1)).toBe(true)
      expect(ArrayPrototypeSome([1, 1], (x: number) => x > 1)).toBe(false)
    })

    it('ArrayPrototypeFill / Find / FindIndex / FindLast / FindLastIndex', () => {
      expect(ArrayPrototypeFill([0, 0, 0], 7)).toEqual([7, 7, 7])
      expect(ArrayPrototypeFind([1, 2, 3], (x: number) => x === 2)).toBe(2)
      expect(ArrayPrototypeFindIndex([1, 2, 3], (x: number) => x === 3)).toBe(2)
      expect(ArrayPrototypeFindLast([1, 2, 3, 2], (x: number) => x === 2)).toBe(
        2,
      )
      expect(
        ArrayPrototypeFindLastIndex([1, 2, 3, 2], (x: number) => x === 2),
      ).toBe(3)
    })

    it('ArrayPrototypeFilter / Map / FlatMap / Flat', () => {
      expect(ArrayPrototypeFilter([1, 2, 3], (x: number) => x > 1)).toEqual([
        2, 3,
      ])
      expect(ArrayPrototypeMap([1, 2, 3], (x: number) => x * 2)).toEqual([
        2, 4, 6,
      ])
      expect(ArrayPrototypeFlatMap([1, 2], (x: number) => [x, x])).toEqual([
        1, 1, 2, 2,
      ])
      expect(ArrayPrototypeFlat([[1, 2], [3]])).toEqual([1, 2, 3])
    })

    it('ArrayPrototypeForEach invokes callback', () => {
      const seen: number[] = []
      ArrayPrototypeForEach([1, 2, 3], (x: number) => seen.push(x))
      expect(seen).toEqual([1, 2, 3])
    })

    it('ArrayPrototypeIncludes / IndexOf / LastIndexOf', () => {
      expect(ArrayPrototypeIncludes([1, 2, 3], 2)).toBe(true)
      expect(ArrayPrototypeIndexOf([1, 2, 1], 1)).toBe(0)
      expect(ArrayPrototypeLastIndexOf([1, 2, 1], 1)).toBe(2)
    })

    it('ArrayPrototypeJoin / Keys / Values', () => {
      expect(ArrayPrototypeJoin(['a', 'b', 'c'], '-')).toBe('a-b-c')
      expect([...ArrayPrototypeKeys(['a', 'b'])]).toEqual([0, 1])
      expect([...ArrayPrototypeValues(['a', 'b'])]).toEqual(['a', 'b'])
    })

    it('ArrayPrototypePush / Pop / Shift / Unshift / Splice', () => {
      const arr: number[] = []
      expect(ArrayPrototypePush(arr, 1, 2, 3)).toBe(3)
      expect(ArrayPrototypePop(arr)).toBe(3)
      expect(ArrayPrototypeShift(arr)).toBe(1)
      expect(ArrayPrototypeUnshift(arr, 9, 8)).toBe(3)
      expect(arr).toEqual([9, 8, 2])
      expect(ArrayPrototypeSplice(arr, 1, 1, 5)).toEqual([8])
      expect(arr).toEqual([9, 5, 2])
    })

    it('ArrayPrototypeReduce / ReduceRight', () => {
      expect(
        ArrayPrototypeReduce([1, 2, 3], (a: number, b: number) => a + b, 0),
      ).toBe(6)
      expect(
        ArrayPrototypeReduceRight(
          ['a', 'b', 'c'],
          (acc: string, x: string) => acc + x,
          '',
        ),
      ).toBe('cba')
    })

    it('ArrayPrototypeReverse mutates; ArrayPrototypeToReversed copies', () => {
      const a = [1, 2, 3]
      ArrayPrototypeReverse(a)
      expect(a).toEqual([3, 2, 1])
      const b = [1, 2, 3]
      expect(ArrayPrototypeToReversed(b)).toEqual([3, 2, 1])
      expect(b).toEqual([1, 2, 3])
    })

    it('ArrayPrototypeSlice / Sort / ToSorted', () => {
      expect(ArrayPrototypeSlice([1, 2, 3, 4], 1, 3)).toEqual([2, 3])
      const a = [3, 1, 2]
      ArrayPrototypeSort(a, (x: number, y: number) => x - y)
      expect(a).toEqual([1, 2, 3])
      const b = [3, 1, 2]
      expect(
        ArrayPrototypeToSorted(b, (x: number, y: number) => x - y),
      ).toEqual([1, 2, 3])
      expect(b).toEqual([3, 1, 2])
    })
  })

  describe('Function (prototype)', () => {
    it('FunctionPrototypeApply invokes with thisArg + args array', () => {
      const greet = function (
        this: { greeting: string },
        name: string,
      ): string {
        return `${this.greeting}, ${name}`
      }
      expect(FunctionPrototypeApply(greet, { greeting: 'Hi' }, ['Jane'])).toBe(
        'Hi, Jane',
      )
    })

    it('FunctionPrototypeBind returns a bound function', () => {
      const add = (a: number, b: number): number => a + b
      const add3 = FunctionPrototypeBind(add as never, null, 3) as (
        b: number,
      ) => number
      expect(add3(4)).toBe(7)
    })

    it('FunctionPrototypeCall invokes with thisArg + variadic args', () => {
      const greet = function (
        this: { greeting: string },
        name: string,
      ): string {
        return `${this.greeting}, ${name}`
      }
      expect(FunctionPrototypeCall(greet, { greeting: 'Hi' }, 'Jane')).toBe(
        'Hi, Jane',
      )
    })
  })

  describe('Math', () => {
    it('basic math primordials', () => {
      expect(MathAbs(-3)).toBe(3)
      expect(MathCeil(1.1)).toBe(2)
      expect(MathFloor(1.9)).toBe(1)
      expect(MathMax(1, 2, 3)).toBe(3)
      expect(MathMin(1, 2, 3)).toBe(1)
      expect(MathPow(2, 8)).toBe(256)
      expect(MathRound(1.5)).toBe(2)
      expect(MathSign(-5)).toBe(-1)
      expect(MathSqrt(16)).toBe(4)
      expect(MathTrunc(1.9)).toBe(1)
    })

    it('MathRandom returns a number in [0, 1)', () => {
      const r = MathRandom()
      expect(r).toBeGreaterThanOrEqual(0)
      expect(r).toBeLessThan(1)
    })
  })

  describe('Number', () => {
    it('static predicates', () => {
      expect(NumberIsFinite(1)).toBe(true)
      expect(NumberIsFinite(Infinity)).toBe(false)
      expect(NumberIsInteger(1)).toBe(true)
      expect(NumberIsInteger(1.1)).toBe(false)
      expect(NumberIsNaN(Number.NaN)).toBe(true)
      expect(NumberIsSafeInteger(2 ** 53 - 1)).toBe(true)
      expect(NumberIsSafeInteger(2 ** 53)).toBe(false)
    })

    it('parseFloat / parseInt', () => {
      expect(NumberParseFloat('3.14')).toBeCloseTo(3.14)
      expect(NumberParseInt('42', 10)).toBe(42)
    })

    it('prototype toFixed / toString via uncurry', () => {
      expect(NumberPrototypeToFixed(3.14159, 2)).toBe('3.14')
      expect(NumberPrototypeToString(255, 16)).toBe('ff')
    })
  })

  describe('Object (static)', () => {
    it('Assign / Create / DefineProperty / DefineProperties', () => {
      expect(ObjectAssign({}, { a: 1 }, { b: 2 })).toEqual({ a: 1, b: 2 })
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
      expect(ObjectPrototypeToString(null)).toBe('[object Null]')
      expect(ObjectPrototypeToString(undefined)).toBe('[object Undefined]')
    })
  })

  describe('Reflect', () => {
    it('Apply / Construct / Has / Get / Set', () => {
      const fn = function (this: { n: number }, x: number) {
        return this.n + x
      }
      expect(ReflectApply(fn, { n: 10 }, [5])).toBe(15)
      // Array(3, 'x') is the two-arg constructor form → [3, 'x'].
      const arr = ReflectConstruct(Array, [3, 'x']) as unknown[]
      expect(arr).toEqual([3, 'x'])
      expect(ReflectHas({ a: 1 }, 'a')).toBe(true)
      expect(ReflectHas({ a: 1 }, 'b')).toBe(false)
      const obj: Record<string, number> = { a: 1 }
      expect(ReflectGet(obj, 'a')).toBe(1)
      ReflectSet(obj, 'b', 2)
      expect(obj['b']).toBe(2)
    })

    it('DefineProperty / DeleteProperty / GetOwnPropertyDescriptor', () => {
      const obj: Record<string, number> = {}
      // configurable:true so DeleteProperty can remove it afterward.
      ReflectDefineProperty(obj, 'x', {
        value: 42,
        enumerable: true,
        configurable: true,
        writable: true,
      })
      expect(obj['x']).toBe(42)
      expect(ReflectGetOwnPropertyDescriptor(obj, 'x')?.value).toBe(42)
      ReflectDeleteProperty(obj, 'x')
      expect('x' in obj).toBe(false)
    })

    it('GetPrototypeOf / SetPrototypeOf', () => {
      const proto = { foo: 1 }
      const obj = ObjectCreate(proto)
      expect(ReflectGetPrototypeOf(obj)).toBe(proto)
      ReflectSetPrototypeOf(obj, null)
      expect(ReflectGetPrototypeOf(obj)).toBe(null)
    })

    it('OwnKeys includes symbols', () => {
      const sym = Symbol('s')
      const obj = { a: 1, [sym]: 2 }
      expect(ReflectOwnKeys(obj)).toEqual(['a', sym])
    })

    it('IsExtensible / PreventExtensions', () => {
      const obj: Record<string, number> = { a: 1 }
      expect(ReflectIsExtensible(obj)).toBe(true)
      ReflectPreventExtensions(obj)
      expect(ReflectIsExtensible(obj)).toBe(false)
    })
  })

  describe('RegExp', () => {
    it('PrototypeExec / PrototypeTest', () => {
      expect(RegExpPrototypeTest(/foo/, 'foobar')).toBe(true)
      expect(RegExpPrototypeTest(/foo/, 'bar')).toBe(false)
      const match = RegExpPrototypeExec(/(\w+)/, 'abc')
      expect(match?.[1]).toBe('abc')
    })

    it('PrototypeSymbolMatch / PrototypeSymbolReplace', () => {
      const m = RegExpPrototypeSymbolMatch(/\d+/, 'a12b') as RegExpMatchArray
      expect(m[0]).toBe('12')
      const replaced = RegExpPrototypeSymbolReplace(/\d+/, 'a12b', 'XX')
      expect(replaced).toBe('aXXb')
    })
  })

  describe('String (static)', () => {
    it('FromCharCode / FromCodePoint / Raw', () => {
      expect(StringFromCharCode(65, 66, 67)).toBe('ABC')
      expect(StringFromCodePoint(0x1f600)).toBe('😀')
      expect(StringRaw({ raw: ['a', 'b', 'c'] }, 1, 2)).toBe('a1b2c')
    })
  })

  describe('String (prototype)', () => {
    it('At / CharAt / CharCodeAt / CodePointAt', () => {
      expect(StringPrototypeAt('hello', -1)).toBe('o')
      expect(StringPrototypeCharAt('hello', 1)).toBe('e')
      expect(StringPrototypeCharCodeAt('A', 0)).toBe(65)
      expect(StringPrototypeCodePointAt('😀', 0)).toBe(0x1f600)
    })

    it('Concat / EndsWith / StartsWith / Includes', () => {
      expect(StringPrototypeConcat('a', 'b', 'c')).toBe('abc')
      expect(StringPrototypeEndsWith('hello', 'lo')).toBe(true)
      expect(StringPrototypeStartsWith('hello', 'he')).toBe(true)
      expect(StringPrototypeIncludes('hello', 'll')).toBe(true)
    })

    it('IndexOf / LastIndexOf / LocaleCompare', () => {
      expect(StringPrototypeIndexOf('foobar', 'bar')).toBe(3)
      expect(StringPrototypeLastIndexOf('banana', 'a')).toBe(5)
      expect(StringPrototypeLocaleCompare('a', 'b')).toBeLessThan(0)
    })

    it('Match / MatchAll / Search', () => {
      const m = StringPrototypeMatch('a12b', /\d+/)
      expect(m?.[0]).toBe('12')
      const all = [...StringPrototypeMatchAll('a1b2c3', /\d/g)]
      expect(all.map(x => x[0])).toEqual(['1', '2', '3'])
      expect(StringPrototypeSearch('abc', /b/)).toBe(1)
    })

    it('Normalize / Repeat / PadStart / PadEnd', () => {
      expect(StringPrototypeNormalize('é')).toBe('é')
      expect(StringPrototypeRepeat('ab', 3)).toBe('ababab')
      expect(StringPrototypePadStart('5', 3, '0')).toBe('005')
      expect(StringPrototypePadEnd('5', 3, '-')).toBe('5--')
    })

    it('Replace / ReplaceAll', () => {
      expect(StringPrototypeReplace('abab', 'a', 'X')).toBe('Xbab')
      expect(StringPrototypeReplaceAll('abab', 'a', 'X')).toBe('XbXb')
    })

    it('Slice / Substring / Split', () => {
      expect(StringPrototypeSlice('hello', 1, 4)).toBe('ell')
      expect(StringPrototypeSubstring('hello', 1, 4)).toBe('ell')
      expect(StringPrototypeSplit('a,b,c', ',')).toEqual(['a', 'b', 'c'])
      expect(StringPrototypeSplit('a,b,c', ',', 2)).toEqual(['a', 'b'])
    })

    it('ToLowerCase / ToUpperCase / Locale variants', () => {
      expect(StringPrototypeToLowerCase('HELLO')).toBe('hello')
      expect(StringPrototypeToUpperCase('hello')).toBe('HELLO')
      expect(StringPrototypeToLocaleLowerCase('HELLO')).toBe('hello')
      expect(StringPrototypeToLocaleUpperCase('hello')).toBe('HELLO')
    })

    it('Trim / TrimStart / TrimEnd', () => {
      expect(StringPrototypeTrim('  hi  ')).toBe('hi')
      expect(StringPrototypeTrimStart('  hi  ')).toBe('hi  ')
      expect(StringPrototypeTrimEnd('  hi  ')).toBe('  hi')
    })
  })

  describe('Symbol', () => {
    it('well-known symbols match globals', () => {
      expect(SymbolAsyncIterator).toBe(Symbol.asyncIterator)
      expect(SymbolIterator).toBe(Symbol.iterator)
      expect(SymbolToPrimitive).toBe(Symbol.toPrimitive)
      expect(SymbolToStringTag).toBe(Symbol.toStringTag)
    })

    it('SymbolFor returns registry symbols', () => {
      expect(SymbolFor('primordials.test')).toBe(Symbol.for('primordials.test'))
    })
  })

  describe('prototype-pollution resilience', () => {
    it('captures persist even if Array.prototype.map is clobbered', () => {
      const saved = Array.prototype.map
      try {
        ;(Array.prototype as { map: unknown }).map = function clobbered() {
          throw new Error('should not be called')
        }
        expect(ArrayPrototypeMap([1, 2, 3], (x: number) => x + 1)).toEqual([
          2, 3, 4,
        ])
      } finally {
        ;(Array.prototype as { map: typeof saved }).map = saved
      }
    })

    it('captures persist even if Array.isArray is clobbered', () => {
      const saved = Array.isArray
      try {
        ;(Array as { isArray: unknown }).isArray = () => false
        expect(ArrayIsArray([1, 2])).toBe(true)
      } finally {
        ;(Array as { isArray: typeof saved }).isArray = saved
      }
    })

    it('captures persist even if Object.keys is clobbered', () => {
      const saved = Object.keys
      try {
        ;(Object as { keys: unknown }).keys = () => ['fake']
        expect(ObjectKeys({ a: 1, b: 2 })).toEqual(['a', 'b'])
      } finally {
        ;(Object as { keys: typeof saved }).keys = saved
      }
    })

    it('captures persist even if String.prototype.slice is clobbered', () => {
      const saved = String.prototype.slice
      try {
        ;(String.prototype as { slice: unknown }).slice = function clobbered() {
          throw new Error('should not be called')
        }
        expect(StringPrototypeSlice('hello', 1, 4)).toBe('ell')
      } finally {
        ;(String.prototype as { slice: typeof saved }).slice = saved
      }
    })

    it('captures persist even if JSON.parse is clobbered', () => {
      const saved = JSON.parse
      try {
        ;(JSON as { parse: unknown }).parse = () => 'evil'
        expect(JSONParse('{"a":1}')).toEqual({ a: 1 })
      } finally {
        ;(JSON as { parse: typeof saved }).parse = saved
      }
    })
  })

  describe('uncurryThis / applyBind', () => {
    it('uncurryThis produces callable functions from prototype methods', () => {
      const upper = uncurryThis(String.prototype.toUpperCase)
      expect(upper('abc')).toBe('ABC')
    })

    it('applyBind accepts an array of args', () => {
      const slice = applyBind(Array.prototype.slice) as (
        self: unknown[],
        args: unknown[],
      ) => unknown[]
      expect(slice([1, 2, 3, 4], [1, 3])).toEqual([2, 3])
    })
  })
})
