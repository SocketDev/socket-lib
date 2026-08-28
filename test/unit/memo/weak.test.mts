/**
 * @file Tests for src/memo/weak — `memoizeWeak`, the object-keyed memoizer.
 *   It had no test file. The variant matters because a WeakMap needs no
 *   eviction policy: the entry goes when the keying object does, which is the
 *   whole reason to reach for it over the bounded `memoize`.
 */

import { describe, expect, it } from 'vitest'

import { memoizeWeak } from '../../../src/memo/weak.mjs'

describe('memoizeWeak', () => {
  it('computes once per object and serves the rest from cache', () => {
    let calls = 0
    const fn = memoizeWeak((o: { n: number }) => {
      calls += 1
      return o.n * 2
    })
    const key = { n: 21 }

    expect(fn(key)).toBe(42)
    expect(fn(key)).toBe(42)
    expect(calls).toBe(1)
  })

  it('keys on reference, not on structure', () => {
    let calls = 0
    const fn = memoizeWeak((o: { n: number }) => {
      calls += 1
      return o.n
    })

    // Equal shape, different identity: two computes, not one.
    fn({ n: 1 })
    fn({ n: 1 })
    expect(calls).toBe(2)
  })

  it('caches an undefined result rather than recomputing it', () => {
    // The `has` fallback exists for exactly this: `get` returning undefined is
    // ambiguous between a miss and a cached undefined.
    let calls = 0
    const fn = memoizeWeak((_o: object) => {
      calls += 1
      return undefined
    })
    const key = {}

    expect(fn(key)).toBeUndefined()
    expect(fn(key)).toBeUndefined()
    expect(calls).toBe(1)
  })

  it('caches a falsy result rather than recomputing it', () => {
    let calls = 0
    const fn = memoizeWeak((_o: object) => {
      calls += 1
      return 0
    })
    const key = {}

    expect(fn(key)).toBe(0)
    expect(fn(key)).toBe(0)
    expect(calls).toBe(1)
  })

  it('keeps separate entries per key', () => {
    const fn = memoizeWeak((o: { n: number }) => o.n * 10)
    const a = { n: 1 }
    const b = { n: 2 }

    expect(fn(a)).toBe(10)
    expect(fn(b)).toBe(20)
    // Re-reading `a` must not have been displaced by `b`.
    expect(fn(a)).toBe(10)
  })

  it('accepts any object key, including functions and arrays', () => {
    const fn = memoizeWeak((o: object) => typeof o)
    const arrayKey: object = []
    const fnKey: object = () => {}

    expect(fn(arrayKey)).toBe('object')
    expect(fn(fnKey)).toBe('function')
  })

  it('gives each memoized wrapper its own cache', () => {
    let first = 0
    let second = 0
    const one = memoizeWeak((_o: object) => ++first)
    const two = memoizeWeak((_o: object) => ++second)
    const key = {}

    expect(one(key)).toBe(1)
    // A shared cache would return 1 here instead of computing.
    expect(two(key)).toBe(1)
    expect(first).toBe(1)
    expect(second).toBe(1)
  })

  it('propagates a throw instead of caching it', () => {
    let calls = 0
    const fn = memoizeWeak((_o: object) => {
      calls += 1
      throw new Error('boom')
    })
    const key = {}

    expect(() => fn(key)).toThrow('boom')
    // Nothing was stored, so the second call recomputes and throws again.
    expect(() => fn(key)).toThrow('boom')
    expect(calls).toBe(2)
  })
})
