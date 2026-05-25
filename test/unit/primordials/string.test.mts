/**
 * @file Unit tests for src/primordials/string — String static + prototype
 *   primordials. Split out of the historical monolithic
 *   test/unit/primordials.test.mts.
 */

import { describe, expect, it } from 'vitest'

import {
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
} from '../../../src/primordials/string'

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

  it('CharCodeAt out-of-bounds returns NaN (matches spec)', () => {
    // The smol-aware wrapper translates Fast API's -1 sentinel back
    // to NaN. On stock Node it's the unwrapped uncurryThis form,
    // which already returns NaN. Both paths must converge.
    expect(StringPrototypeCharCodeAt('A', 1)).toBeNaN()
    expect(StringPrototypeCharCodeAt('', 0)).toBeNaN()
    expect(StringPrototypeCharCodeAt('foo', -1)).toBeNaN()
    expect(StringPrototypeCharCodeAt('foo', 100)).toBeNaN()
  })

  it('CharCodeAt handles two-byte / non-ASCII correctly', () => {
    // Two-byte strings fall through Fast API's one-byte filter and
    // hit the slow path (or stock JS on non-smol). Either way, the
    // observable result must match `String.prototype.charCodeAt`.
    expect(StringPrototypeCharCodeAt('é', 0)).toBe(233)
    expect(StringPrototypeCharCodeAt('日本', 0)).toBe(0x65e5)
    expect(StringPrototypeCharCodeAt('日本', 1)).toBe(0x672c)
    // Surrogate pair: charCodeAt returns the high/low surrogate
    // code unit, not the codepoint.
    expect(StringPrototypeCharCodeAt('😀', 0)).toBe(0xd83d)
    expect(StringPrototypeCharCodeAt('😀', 1)).toBe(0xde00)
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
