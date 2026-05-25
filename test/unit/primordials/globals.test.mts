/**
 * @file Unit tests for primordial constructors + globals + JSON. Split out of
 *   the historical monolithic test/unit/primordials.test.mts to keep each test
 *   file under the fleet's 500-line soft cap.
 */

import { describe, expect, it } from 'vitest'

import { ArrayCtor } from '../../../src/primordials/array'

import { DateCtor } from '../../../src/primordials/date'

import { ErrorCtor } from '../../../src/primordials/error'

import {
  BigIntCtor,
  BooleanCtor,
  InfinityValue,
  NaNValue,
  ProxyCtor,
  SharedArrayBufferCtor,
  atob as GlobalAtob,
  btoa as GlobalBtoa,
  decodeURIComponent as GlobalDecodeURIComponent,
  encodeURIComponent as GlobalEncodeURIComponent,
  globalThis as GlobalThis,
} from '../../../src/primordials/globals'

import { JSONParse, JSONStringify } from '../../../src/primordials/json'

import {
  MapCtor,
  SetCtor,
  WeakMapCtor,
  WeakRefCtor,
  WeakSetCtor,
} from '../../../src/primordials/map-set'

import { NumberCtor } from '../../../src/primordials/number'

import { ObjectCtor } from '../../../src/primordials/object'

import { PromiseCtor } from '../../../src/primordials/promise'

import { RegExpCtor } from '../../../src/primordials/regexp'

import { StringCtor } from '../../../src/primordials/string'

import { SymbolCtor } from '../../../src/primordials/symbol'

import { URLCtor, URLSearchParamsCtor } from '../../../src/primordials/url'

describe('constructors', () => {
  it('points at the JavaScript global constructors', () => {
    expect(ArrayCtor).toBe(Array)
    expect(BigIntCtor).toBe(BigInt)
    expect(BooleanCtor).toBe(Boolean)
    expect(DateCtor).toBe(Date)
    expect(ErrorCtor).toBe(Error)
    expect(MapCtor).toBe(Map)
    expect(NumberCtor).toBe(Number)
    expect(ObjectCtor).toBe(Object)
    expect(PromiseCtor).toBe(Promise)
    expect(ProxyCtor).toBe(Proxy)
    expect(RegExpCtor).toBe(RegExp)
    expect(SetCtor).toBe(Set)
    expect(SharedArrayBufferCtor).toBe(SharedArrayBuffer)
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

  it('BigIntCtor coerces and constructs BigInts', () => {
    // BigInt is callable as a function (no `new`); calling it with `new`
    // throws by spec. The primordial is the function reference, so
    // both styles below work the same as the global.
    expect(BigIntCtor(42)).toBe(42n)
    expect(BigIntCtor('100')).toBe(100n)
    expect(typeof BigIntCtor(0)).toBe('bigint')
    expect(
      () => new (BigIntCtor as unknown as new (n: number) => bigint)(1),
    ).toThrow(TypeError)
  })

  it('ProxyCtor wraps a target with handlers', () => {
    const target = { a: 1 }
    const proxy = new ProxyCtor(target, {
      get: (_, prop) => (prop === 'a' ? 42 : undefined),
    })
    expect(proxy.a).toBe(42)
  })

  it('SharedArrayBufferCtor allocates a fixed-size buffer', () => {
    const sab = new SharedArrayBufferCtor(8)
    expect(sab.byteLength).toBe(8)
    expect(sab).toBeInstanceOf(SharedArrayBuffer)
  })
})

describe('global functions', () => {
  it('GlobalDecodeURIComponent / GlobalEncodeURIComponent round-trip', () => {
    const raw = 'hello world!'
    expect(GlobalDecodeURIComponent(GlobalEncodeURIComponent(raw))).toBe(raw)
  })

  it('GlobalAtob / GlobalBtoa round-trip', () => {
    const raw = 'hello world!'
    expect(GlobalAtob(GlobalBtoa(raw))).toBe(raw)
  })
})

describe('global values', () => {
  it('InfinityValue / NaNValue mirror the language globals', () => {
    expect(InfinityValue).toBe(Infinity)
    expect(InfinityValue).toBe(Number.POSITIVE_INFINITY)
    expect(Number.isNaN(NaNValue)).toBe(true)
    // NaN-equal-to-itself isn't a thing — but NaNValue must be a
    // float NaN, distinct from `null` / `undefined`.
    expect(typeof NaNValue).toBe('number')
  })

  it('GlobalThis is the same object as the live globalThis', () => {
    expect(GlobalThis).toBe(globalThis)
    expect(typeof GlobalThis.Object).toBe('function')
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
