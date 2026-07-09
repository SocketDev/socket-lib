/**
 * @file Tests for the special-handling key-gen branches in src/memoization.ts:
 *   bigint, function, Map, Set arguments — types JSON.stringify drops or
 *   collapses by default.
 */

import { describe, expect, it } from 'vitest'

import { memoize } from '../../../src/memo/memoize'

describe('memoization — defaultKeyGen edge args', () => {
  it('disambiguates undefined arguments', () => {
    let calls = 0
    const fn = memoize((..._args: unknown[]) => ++calls)
    expect(fn(undefined)).toBe(1)
    expect(fn(undefined)).toBe(1) // cache hit
    expect(fn()).toBe(2) // distinct: no args
  })

  it('serializes bigint arguments', () => {
    let calls = 0
    const fn = memoize((..._args: unknown[]) => ++calls)
    expect(fn(1n)).toBe(1)
    expect(fn(1n)).toBe(1)
    expect(fn(2n)).toBe(2)
  })

  it('serializes function arguments by name', () => {
    let calls = 0
    const fn = memoize((..._args: unknown[]) => ++calls)
    function namedA() {}
    function namedB() {}
    expect(fn(namedA)).toBe(1)
    expect(fn(namedA)).toBe(1)
    expect(fn(namedB)).toBe(2) // different name → different key
  })

  it('serializes Map arguments via entries', () => {
    let calls = 0
    const fn = memoize((..._args: unknown[]) => ++calls)
    const a = new Map([['k', 1]])
    const b = new Map([['k', 1]])
    const c = new Map([['k', 2]])
    expect(fn(a)).toBe(1)
    expect(fn(b)).toBe(1) // same entries → cache hit
    expect(fn(c)).toBe(2)
  })

  it('serializes Set arguments via values', () => {
    let calls = 0
    const fn = memoize((..._args: unknown[]) => ++calls)
    const a = new Set([1, 2])
    const b = new Set([1, 2])
    const c = new Set([1, 3])
    expect(fn(a)).toBe(1)
    expect(fn(b)).toBe(1)
    expect(fn(c)).toBe(2)
  })
})

describe('memo/memoize — TTL guard + expiration', () => {
  it('throws on negative TTL', () => {
    expect(() => memoize((x: number) => x, { ttl: -1 } as never)).toThrow(
      TypeError,
    )
  })

  it('drops expired entries on next read', async () => {
    let calls = 0
    const TTL_MS = 100
    const fn = memoize(
      (x: number) => {
        calls += 1
        return x * 2
      },
      { ttl: TTL_MS } as never,
    )
    fn(1)
    fn(1)
    expect(calls).toBe(1)
    await new Promise(r => setTimeout(r, TTL_MS * 2 + 20))
    fn(1)
    expect(calls).toBe(2)
  })
})
