/**
 * @file Tests for src/memo/weak-async — `memoizeWeakAsync`. The two behaviours
 *   that separate it from `memoizeWeak` get the most attention: a rejection
 *   must not stay cached, and concurrent callers must share one computation.
 */

import { describe, expect, it } from 'vitest'

import { memoizeWeakAsync } from '../../../src/memo/weak-async.mjs'

describe('memoizeWeakAsync', () => {
  it('computes once per object and serves the rest from cache', async () => {
    let calls = 0
    const fn = memoizeWeakAsync(async (o: { n: number }) => {
      calls += 1
      return o.n * 2
    })
    const key = { n: 21 }

    expect(await fn(key)).toBe(42)
    expect(await fn(key)).toBe(42)
    expect(calls).toBe(1)
  })

  it('keys on reference, not on structure', async () => {
    let calls = 0
    const fn = memoizeWeakAsync(async (o: { n: number }) => {
      calls += 1
      return o.n
    })

    await fn({ n: 1 })
    await fn({ n: 1 })
    expect(calls).toBe(2)
  })

  it('shares one computation between concurrent callers', async () => {
    let calls = 0
    let release: (() => void) | undefined
    const gate = new Promise<void>(resolve => {
      release = resolve
    })
    const fn = memoizeWeakAsync(async (_o: object) => {
      calls += 1
      await gate
      return 'done'
    })
    const key = {}

    // Both start before the first settles, so they must join one call.
    const both = Promise.all([fn(key), fn(key)])
    release!()

    expect(await both).toEqual(['done', 'done'])
    expect(calls).toBe(1)
  })

  it('does not cache a rejection, so the next call retries', async () => {
    let calls = 0
    const fn = memoizeWeakAsync(async (_o: object) => {
      calls += 1
      throw new Error('boom')
    })
    const key = {}

    await expect(fn(key)).rejects.toThrow('boom')
    await expect(fn(key)).rejects.toThrow('boom')
    // A cached rejection would leave this at 1 and never retry.
    expect(calls).toBe(2)
  })

  it('caches the success that follows a rejection', async () => {
    let calls = 0
    const fn = memoizeWeakAsync(async (_o: object) => {
      calls += 1
      if (calls === 1) {
        throw new Error('transient')
      }
      return 'ok'
    })
    const key = {}

    await expect(fn(key)).rejects.toThrow('transient')
    expect(await fn(key)).toBe('ok')
    // The retry's result is cached, so a third call adds nothing.
    expect(await fn(key)).toBe('ok')
    expect(calls).toBe(2)
  })

  it('caches a resolved undefined rather than recomputing it', async () => {
    let calls = 0
    const fn = memoizeWeakAsync(async (_o: object) => {
      calls += 1
      return undefined
    })
    const key = {}

    expect(await fn(key)).toBeUndefined()
    expect(await fn(key)).toBeUndefined()
    expect(calls).toBe(1)
  })

  it('accepts a synchronous function and still returns a promise', async () => {
    let calls = 0
    const fn = memoizeWeakAsync((o: { n: number }) => {
      calls += 1
      return o.n
    })
    const key = { n: 7 }

    const result = fn(key)
    expect(result).toBeInstanceOf(Promise)
    expect(await result).toBe(7)
    expect(await fn(key)).toBe(7)
    expect(calls).toBe(1)
  })

  it('keeps separate entries per key', async () => {
    const fn = memoizeWeakAsync(async (o: { n: number }) => o.n * 10)
    const a = { n: 1 }
    const b = { n: 2 }

    expect(await fn(a)).toBe(10)
    expect(await fn(b)).toBe(20)
    expect(await fn(a)).toBe(10)
  })

  it('gives each memoized wrapper its own cache', async () => {
    let first = 0
    let second = 0
    const one = memoizeWeakAsync(async (_o: object) => ++first)
    const two = memoizeWeakAsync(async (_o: object) => ++second)
    const key = {}

    expect(await one(key)).toBe(1)
    // A shared cache would return 1 from the first wrapper's entry.
    expect(await two(key)).toBe(1)
    expect(first).toBe(1)
    expect(second).toBe(1)
  })
})
