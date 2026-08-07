/**
 * @file Unit tests for the keyed promise combinators (pAllKeyed,
 *   pAllSettledKeyed) — the tc39 proposal-await-dictionary shapes as
 *   helpers. Pins the spec semantics the proposal calls out against
 *   existing libraries: enumerable SYMBOL keys are included, the result is
 *   a null-prototype object, and a rejection in pAllKeyed leaves no
 *   unhandled-rejection stragglers.
 */

import { describe, expect, it } from 'vitest'

import { minTimerQuantum } from '../_shared/fleet/lib/timing.mts'

import { pAllKeyed, pAllSettledKeyed } from '../../src/promises/all-keyed'

describe('pAllKeyed', () => {
  it('awaits a dictionary by key', async () => {
    const result = await pAllKeyed({
      shape: Promise.resolve('circle'),
      color: Promise.resolve('teal'),
      mass: Promise.resolve(42),
    })
    expect(result).toEqual({ shape: 'circle', color: 'teal', mass: 42 })
  })

  it('passes plain values through Promise.resolve', async () => {
    const result = await pAllKeyed({ a: 1, b: Promise.resolve(2) })
    expect(result.a).toBe(1)
    expect(result.b).toBe(2)
  })

  it('returns a null-prototype object', async () => {
    const result = await pAllKeyed({ a: Promise.resolve(1) })
    expect(Object.getPrototypeOf(result)).toBe(null)
  })

  it('includes enumerable symbol keys (the spec divergence from p-props)', async () => {
    const sym = Symbol('mass')
    const result = await pAllKeyed({
      shape: Promise.resolve('circle'),
      [sym]: Promise.resolve(42),
    })
    expect(result[sym]).toBe(42)
  })

  it('skips non-enumerable properties', async () => {
    const dict: Record<string, Promise<number>> = {
      visible: Promise.resolve(1),
    }
    Object.defineProperty(dict, 'hidden', {
      value: Promise.resolve(2),
      enumerable: false,
    })
    const result = await pAllKeyed(dict)
    expect(result['visible']).toBe(1)
    expect('hidden' in result).toBe(false)
  })

  it('resolves an empty dictionary to an empty null-proto object', async () => {
    const result = await pAllKeyed({})
    expect(Object.keys(result)).toEqual([])
    expect(Object.getPrototypeOf(result)).toBe(null)
  })

  it('rejects with the first rejection reason', async () => {
    const boom = new Error('boom')
    await expect(
      pAllKeyed({
        ok: Promise.resolve(1),
        bad: Promise.reject(boom),
      }),
    ).rejects.toBe(boom)
  })

  it('subscribes every promise, so a sibling rejection is not unhandled', async () => {
    // The motivating hazard from the proposal: awaiting one property at a
    // time leaves later rejections unhandled. Both rejections here are
    // subscribed by the combinator; the second must not surface as an
    // unhandled rejection after the first wins the race.
    const first = new Error('first')
    const { promise: later, reject: rejectLater } =
      Promise.withResolvers<never>()
    const combined = pAllKeyed({
      early: Promise.reject(first),
      later,
    })
    await expect(combined).rejects.toBe(first)
    rejectLater(new Error('second'))
    // Drain microtasks; an unhandled rejection here would fail the run.
    await new Promise(resolve => {
      setImmediate(resolve)
    })
  })

  it('rejects a non-object dictionary with a TypeError', async () => {
    await expect(
      // oxlint-disable-next-line socket/prefer-undefined-over-null -- the spec-mandated null-input TypeError is the behavior under test
      pAllKeyed(null as unknown as Record<string, never>),
    ).rejects.toThrow(TypeError)
    await expect(
      pAllKeyed(42 as unknown as Record<string, never>),
    ).rejects.toThrow(TypeError)
  })
})

describe('pAllSettledKeyed', () => {
  it('always resolves, with per-key settled records', async () => {
    const boom = new Error('boom')
    const results = await pAllSettledKeyed({
      good: Promise.resolve('yes'),
      bad: Promise.reject(boom),
    })
    expect(results.good).toEqual({ status: 'fulfilled', value: 'yes' })
    expect(results.bad).toEqual({ status: 'rejected', reason: boom })
  })

  it('returns a null-prototype object with symbol keys included', async () => {
    const sym = Symbol('s')
    const results = await pAllSettledKeyed({ [sym]: Promise.resolve(1) })
    expect(Object.getPrototypeOf(results)).toBe(null)
    expect(results[sym]).toEqual({ status: 'fulfilled', value: 1 })
  })

  it('resolves an empty dictionary', async () => {
    const results = await pAllSettledKeyed({})
    expect(Object.keys(results)).toEqual([])
  })
})

// ── Spec-conformance depth ─────────────────────────────────────────────

describe('pAllKeyed — spec conformance', () => {
  it('preserves [[OwnPropertyKeys]] order: integer-like, then strings, then symbols', async () => {
    const s1 = Symbol('s1')
    const s2 = Symbol('s2')
    const dict = {
      zebra: Promise.resolve('z'),
      2: Promise.resolve('two'),
      [s1]: Promise.resolve('sym1'),
      apple: Promise.resolve('a'),
      0: Promise.resolve('zero'),
      [s2]: Promise.resolve('sym2'),
    }
    const result = await pAllKeyed(dict)
    expect(Reflect.ownKeys(result)).toEqual(Reflect.ownKeys(dict))
    expect(Reflect.ownKeys(result)).toEqual([
      '0',
      '2',
      'zebra',
      'apple',
      s1,
      s2,
    ])
  })

  it('reads accessor properties exactly once via Get', async () => {
    let reads = 0
    const dict = {
      get lazy() {
        reads += 1
        return Promise.resolve('computed')
      },
    }
    const result = await pAllKeyed(dict)
    expect(result.lazy).toBe('computed')
    expect(reads).toBe(1)
  })

  it('rejects when a getter throws (abrupt Get completion)', async () => {
    const boom = new Error('getter boom')
    const dict = {
      get bad(): Promise<never> {
        throw boom
      },
    }
    await expect(pAllKeyed(dict)).rejects.toBe(boom)
  })

  it('unwraps non-Promise thenables through Promise.resolve', async () => {
    // A hand-rolled thenable IS the subject: the spec resolves values
    // through Promise.resolve, which must unwrap it.
    // oxlint-disable-next-line unicorn/no-thenable -- thenable is the subject
    const thenable = {
      // oxlint-disable-next-line unicorn/no-thenable -- thenable is the subject
      then(resolve: (v: string) => void) {
        resolve('from thenable')
      },
    }
    const result = await pAllKeyed({ t: thenable })
    expect(result.t).toBe('from thenable')
  })

  it('accepts the same promise under two keys', async () => {
    const shared = Promise.resolve('once')
    const result = await pAllKeyed({ a: shared, b: shared })
    expect(result.a).toBe('once')
    expect(result.b).toBe('once')
  })

  it('ignores inherited enumerable properties (own-only, like Object.keys)', async () => {
    const proto = { inherited: Promise.resolve('nope') }
    const dict = Object.create(proto) as Record<string, Promise<string>>
    dict['own'] = Promise.resolve('yes')
    const result = await pAllKeyed(dict)
    expect(result['own']).toBe('yes')
    expect('inherited' in result).toBe(false)
  })

  it('skips non-enumerable SYMBOL properties too', async () => {
    const sym = Symbol('hidden')
    const dict: Record<PropertyKey, Promise<number>> = {
      visible: Promise.resolve(1),
    }
    Object.defineProperty(dict, sym, {
      value: Promise.resolve(2),
      enumerable: false,
    })
    const result = await pAllKeyed(dict)
    expect(sym in result).toBe(false)
  })

  it('treats an array as a dictionary of its indices (length is non-enumerable)', async () => {
    const result = await pAllKeyed([Promise.resolve('a'), Promise.resolve('b')])
    expect(result[0]).toBe('a')
    expect(result[1]).toBe('b')
    expect('length' in result).toBe(false)
    expect(Object.getPrototypeOf(result)).toBe(null)
  })

  it('accepts a function carrying enumerable own properties (functions are objects)', async () => {
    const fn = Object.assign(() => undefined, { extra: Promise.resolve(7) })
    const result = await pAllKeyed(fn)
    expect(result.extra).toBe(7)
  })

  it('runs values in parallel, not as a waterfall', async () => {
    const order: string[] = []
    function step(name: string, ms: number): Promise<string> {
      return new Promise(resolve => {
        setTimeout(() => {
          order.push(name)
          resolve(name)
        }, minTimerQuantum(ms))
      })
    }
    const started = Date.now()
    await pAllKeyed({
      slow: step('slow', 30),
      fast: step('fast', 5),
    })
    // A waterfall would run slow (30ms) THEN fast (5ms); parallel start
    // means fast settles first and the whole thing takes ~one slow step.
    expect(order).toEqual(['fast', 'slow'])
    expect(Date.now() - started).toBeLessThan(minTimerQuantum(30) * 2)
  })

  it('rejects with the FIRST-SETTLING rejection regardless of key order', async () => {
    const slow = new Error('slow reject')
    const fast = new Error('fast reject')
    function rejectAfter(reason: Error, ms: number): Promise<never> {
      const { promise, reject } = Promise.withResolvers<never>()
      setTimeout(() => reject(reason), minTimerQuantum(ms))
      return promise
    }
    await expect(
      pAllKeyed({
        // Key order puts the slow rejection first; settle order wins.
        a: rejectAfter(slow, 30),
        b: rejectAfter(fast, 5),
      }),
    ).rejects.toBe(fast)
  })

  it('defines result keys as enumerable writable configurable data properties', async () => {
    const result = await pAllKeyed({ a: Promise.resolve(1) })
    const desc = Object.getOwnPropertyDescriptor(result, 'a')
    expect(desc).toEqual({
      value: 1,
      writable: true,
      enumerable: true,
      configurable: true,
    })
  })

  it('rejects undefined and boolean dictionaries with a TypeError', async () => {
    await expect(
      pAllKeyed(undefined as unknown as Record<string, never>),
    ).rejects.toThrow(TypeError)
    await expect(
      pAllKeyed(true as unknown as Record<string, never>),
    ).rejects.toThrow(TypeError)
  })
})

describe('pAllSettledKeyed — spec conformance', () => {
  it('settled records carry Object.prototype (only the dictionary is null-proto)', async () => {
    const results = await pAllSettledKeyed({ a: Promise.resolve(1) })
    expect(Object.getPrototypeOf(results)).toBe(null)
    expect(Object.getPrototypeOf(results.a)).toBe(Object.prototype)
  })

  it('preserves [[OwnPropertyKeys]] order like pAllKeyed', async () => {
    const sym = Symbol('s')
    const dict = {
      b: Promise.resolve(1),
      1: Promise.resolve(2),
      [sym]: Promise.resolve(3),
    }
    const results = await pAllSettledKeyed(dict)
    expect(Reflect.ownKeys(results)).toEqual(['1', 'b', sym])
  })

  it('mixes fulfilled and rejected records without rejecting', async () => {
    const boom = new Error('nope')
    const results = await pAllSettledKeyed({
      ok: 'plain value',
      bad: Promise.reject(boom),
      alsoOk: Promise.resolve(2),
    })
    expect(results.ok).toEqual({ status: 'fulfilled', value: 'plain value' })
    expect(results.bad).toEqual({ status: 'rejected', reason: boom })
    expect(results.alsoOk).toEqual({ status: 'fulfilled', value: 2 })
  })

  it('rejects a non-object dictionary with a TypeError', async () => {
    await expect(
      pAllSettledKeyed('nope' as unknown as Record<string, never>),
    ).rejects.toThrow(TypeError)
  })

  it('rejects when a getter throws (Get happens during collection)', async () => {
    const boom = new Error('getter boom')
    const dict = {
      get bad(): Promise<never> {
        throw boom
      },
    }
    await expect(pAllSettledKeyed(dict)).rejects.toBe(boom)
  })
})
