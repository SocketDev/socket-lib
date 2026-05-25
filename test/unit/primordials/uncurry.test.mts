/**
 * @file Unit tests for src/primordials/uncurry — uncurryThis, applyBind,
 *   applySafe, bindCall, weakRefSafe + prototype-pollution resilience. Split
 *   out of the historical monolithic test/unit/primordials.test.mts.
 */

import { describe, expect, it } from 'vitest'

import { ArrayIsArray, ArrayPrototypeMap } from '../../../src/primordials/array'

import { JSONParse } from '../../../src/primordials/json'

import { ObjectKeys } from '../../../src/primordials/object'

import { StringPrototypeSlice } from '../../../src/primordials/string'

import {
  applyBind,
  applySafe,
  bindCall,
  uncurryThis,
  weakRefSafe,
} from '../../../src/primordials/uncurry'

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

describe('applySafe / bindCall / weakRefSafe', () => {
  it('applySafe swallows synchronous throws and returns undefined', () => {
    // The function throws, so applySafe must return undefined rather
    // than propagate. This is the contract: any thrown value (Error,
    // string, undefined, anything) becomes undefined at the call site.
    const throwing = applySafe(() => {
      throw new Error('boom')
    }) as (self: unknown, args: unknown[]) => unknown
    expect(throwing(undefined, [])).toBeUndefined()
  })

  it('applySafe returns the call result on the happy path', () => {
    const sum = applySafe((a: number, b: number) => a + b) as (
      self: unknown,
      args: [number, number],
    ) => number | undefined
    expect(sum(undefined, [2, 3])).toBe(5)
  })

  it('applySafe with non-array second arg returns undefined', () => {
    // Best-effort contract: a non-array `args` is treated as "no args"
    // and the call still happens (the native form skips it; the JS
    // fallback's try/catch catches the TypeError from .apply).
    const fn = applySafe(() => 42) as unknown as (
      self: unknown,
      args: unknown,
    ) => unknown
    // On the native path this returns undefined (rejected at the
    // type guard). On the JS fallback path the inner .apply throws
    // and applySafe swallows. Both converge on undefined.
    expect(
      fn(undefined, 'not-an-array' as unknown as unknown[]),
    ).toBeUndefined()
  })

  it('bindCall pre-supplies the `this` plus leading args', () => {
    function add(this: unknown, a: number, b: number): number {
      return a + b
    }
    const add5 = bindCall(add, undefined, 5)
    expect(add5(7)).toBe(12)
  })

  it('bindCall with no preset args is a thin call-with-this wrapper', () => {
    const addAll = bindCall(function (this: unknown, ...nums: number[]) {
      return nums.reduce((s, n) => s + n, 0)
    }, undefined)
    expect(addAll(1, 2, 3)).toBe(6)
  })

  it('weakRefSafe wraps an Object', () => {
    const target = { x: 1 }
    const ref = weakRefSafe(target)
    expect(ref).toBeDefined()
    expect(ref!.deref()).toBe(target)
  })

  it('weakRefSafe wraps a non-registered Symbol', () => {
    const sym = Symbol('local')
    const ref = weakRefSafe(sym)
    expect(ref).toBeDefined()
    expect(ref!.deref()).toBe(sym)
  })

  it('weakRefSafe returns undefined for primitives', () => {
    // The native form rejects at the predicate; the JS fallback's
    // `new WeakRef(...)` would throw TypeError and the try/catch
    // converts it to undefined. Same observable outcome.
    // Cast through unknown to bypass the `object | symbol` constraint
    // for testing the failure path.
    const wrap = weakRefSafe as unknown as (v: unknown) => unknown
    expect(wrap(42)).toBeUndefined()
    expect(wrap('hello')).toBeUndefined()
    expect(wrap(true)).toBeUndefined()
    expect(wrap(undefined)).toBeUndefined()
    expect(wrap(undefined)).toBeUndefined()
  })

  it('weakRefSafe returns undefined for registered Symbols', () => {
    // `Symbol.for(_)` returns a registered symbol — WeakRef rejects it.
    // Both paths converge on undefined.
    const wrap = weakRefSafe as unknown as (v: unknown) => unknown
    expect(wrap(Symbol.for('registered'))).toBeUndefined()
  })
})
