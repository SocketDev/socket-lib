/**
 * @file Unit tests for misc primordial groups — Buffer, Date, Atomics,
 *   Iterator, Map, Promise, Set, URLSearchParams, WeakMap, WeakSet. Split out
 *   of the historical monolithic test/unit/primordials.test.mts.
 */

import { describe, expect, it } from 'vitest'

import {
  AtomicsWait,
  IteratorPrototypeNext,
  IteratorPrototypeReturn,
} from '../../../src/primordials/array'

import {
  BufferCtor,
  BufferPrototypeSlice,
  BufferPrototypeToString,
} from '../../../src/primordials/buffer'

import {
  DatePrototypeGetTime,
  DatePrototypeToISOString,
  DatePrototypeToLocaleString,
  DatePrototypeValueOf,
} from '../../../src/primordials/date'

import {
  MapPrototypeClear,
  MapPrototypeDelete,
  MapPrototypeEntries,
  MapPrototypeForEach,
  MapPrototypeGet,
  MapPrototypeHas,
  MapPrototypeKeys,
  MapPrototypeSet,
  MapPrototypeValues,
  SetPrototypeAdd,
  SetPrototypeClear,
  SetPrototypeDelete,
  SetPrototypeEntries,
  SetPrototypeForEach,
  SetPrototypeHas,
  SetPrototypeKeys,
  SetPrototypeValues,
  WeakMapPrototypeDelete,
  WeakMapPrototypeGet,
  WeakMapPrototypeHas,
  WeakMapPrototypeSet,
  WeakSetPrototypeAdd,
  WeakSetPrototypeDelete,
  WeakSetPrototypeHas,
} from '../../../src/primordials/map-set'

import {
  PromisePrototypeCatch,
  PromisePrototypeFinally,
  PromisePrototypeThen,
} from '../../../src/primordials/promise'

import {
  URLSearchParamsPrototypeAppend,
  URLSearchParamsPrototypeDelete,
  URLSearchParamsPrototypeForEach,
  URLSearchParamsPrototypeGet,
  URLSearchParamsPrototypeGetAll,
  URLSearchParamsPrototypeHas,
  URLSearchParamsPrototypeSet,
} from '../../../src/primordials/url'

describe('primordials (extended surface)', () => {
  describe('Buffer', () => {
    it('BufferCtor matches globalThis.Buffer when available', () => {
      if (typeof Buffer === 'undefined') {
        expect(BufferCtor).toBeUndefined()
        return
      }
      expect(BufferCtor).toBe(Buffer)
      const buf = Buffer.from('hello')
      expect(BufferPrototypeToString?.(buf, 'utf8')).toBe('hello')
      expect(BufferPrototypeSlice?.(buf, 0, 3).toString('utf8')).toBe('hel')
    })
  })

  describe('Date (prototype)', () => {
    it('GetTime / ToISOString / ValueOf', () => {
      const d = new Date(0)
      expect(DatePrototypeGetTime(d)).toBe(0)
      expect(DatePrototypeToISOString(d)).toBe('1970-01-01T00:00:00.000Z')
      expect(DatePrototypeValueOf(d)).toBe(0)
    })

    it('ToLocaleString returns a non-empty string', () => {
      const d = new Date(0)
      // Locale output varies by environment; just confirm we get a
      // non-empty string back from the uncurried call.
      expect(typeof DatePrototypeToLocaleString(d)).toBe('string')
      expect(DatePrototypeToLocaleString(d).length).toBeGreaterThan(0)
    })
  })

  describe('Atomics', () => {
    it('AtomicsWait returns "timed-out" when no notify arrives', () => {
      // 0ms timeout — wait completes immediately with 'timed-out'
      // because no other agent is going to notify on this buffer.
      const sab = new SharedArrayBuffer(4)
      const view = new Int32Array(sab)
      expect(AtomicsWait(view, 0, 0, 0)).toBe('timed-out')
    })

    it('AtomicsWait returns "not-equal" when value mismatches', () => {
      // When the slot value differs from the expected value, wait
      // returns 'not-equal' immediately without blocking.
      const sab = new SharedArrayBuffer(4)
      const view = new Int32Array(sab)
      view[0] = 7
      expect(AtomicsWait(view, 0, 0, 0)).toBe('not-equal')
    })
  })

  describe('Iterator (prototype)', () => {
    it('IteratorPrototypeNext pulls values from any built-in iterator', () => {
      const m = new Map([
        ['a', 1],
        ['b', 2],
      ])
      const it = m.keys()
      expect(IteratorPrototypeNext(it)).toEqual({ value: 'a', done: false })
      expect(IteratorPrototypeNext(it)).toEqual({ value: 'b', done: false })
      expect(IteratorPrototypeNext(it).done).toBe(true)
    })

    it('IteratorPrototypeReturn short-circuits an iterator when present', () => {
      if (!IteratorPrototypeReturn) {
        return
      }
      const m = new Map([
        ['a', 1],
        ['b', 2],
      ])
      const it = m.keys()
      IteratorPrototypeReturn(it)
      expect(IteratorPrototypeNext(it).done).toBe(true)
    })
  })

  describe('Map (prototype)', () => {
    it('Clear / Delete / Get / Has / Set / Keys / Values / Entries / ForEach', () => {
      const m = new Map<string, number>()
      MapPrototypeSet(m, 'a', 1)
      MapPrototypeSet(m, 'b', 2)
      expect(MapPrototypeGet(m, 'a')).toBe(1)
      expect(MapPrototypeHas(m, 'b')).toBe(true)
      expect([...MapPrototypeKeys(m)]).toEqual(['a', 'b'])
      expect([...MapPrototypeValues(m)]).toEqual([1, 2])
      expect([...MapPrototypeEntries(m)]).toEqual([
        ['a', 1],
        ['b', 2],
      ])
      const seen: Array<[string, number]> = []
      MapPrototypeForEach(m, (v, k) => seen.push([k, v]))
      expect(seen).toEqual([
        ['a', 1],
        ['b', 2],
      ])
      MapPrototypeDelete(m, 'a')
      expect(MapPrototypeHas(m, 'a')).toBe(false)
      MapPrototypeClear(m)
      expect(m.size).toBe(0)
    })
  })

  describe('Promise (prototype)', () => {
    it('PromisePrototypeThen / Catch / Finally preserve semantics', async () => {
      const resolved = PromisePrototypeThen(
        Promise.resolve(1),
        (x: number) => x + 1,
      )
      expect(await resolved).toBe(2)

      const caught = PromisePrototypeCatch(
        Promise.reject(new Error('boom')) as Promise<number>,
        (e: Error) => e.message,
      )
      expect(await caught).toBe('boom')

      let finallyCalled = false
      await PromisePrototypeFinally(Promise.resolve(1), () => {
        finallyCalled = true
      })
      expect(finallyCalled).toBe(true)
    })
  })

  describe('Set (prototype)', () => {
    it('Add / Clear / Delete / Entries / ForEach / Has / Keys / Values', () => {
      const s = new Set<number>()
      SetPrototypeAdd(s, 1)
      SetPrototypeAdd(s, 2)
      expect(SetPrototypeHas(s, 1)).toBe(true)
      expect([...SetPrototypeKeys(s)]).toEqual([1, 2])
      expect([...SetPrototypeValues(s)]).toEqual([1, 2])
      expect([...SetPrototypeEntries(s)]).toEqual([
        [1, 1],
        [2, 2],
      ])
      const seen: number[] = []
      SetPrototypeForEach(s, v => seen.push(v))
      expect(seen).toEqual([1, 2])
      SetPrototypeDelete(s, 1)
      expect(SetPrototypeHas(s, 1)).toBe(false)
      SetPrototypeClear(s)
      expect(s.size).toBe(0)
    })
  })

  describe('URLSearchParams (prototype)', () => {
    it('Append / Delete / Get / GetAll / Has / Set / ForEach', () => {
      const p = new URLSearchParams()
      URLSearchParamsPrototypeAppend(p, 'a', '1')
      URLSearchParamsPrototypeAppend(p, 'a', '2')
      URLSearchParamsPrototypeSet(p, 'b', '3')
      expect(URLSearchParamsPrototypeGet(p, 'a')).toBe('1')
      expect(URLSearchParamsPrototypeGetAll(p, 'a')).toEqual(['1', '2'])
      expect(URLSearchParamsPrototypeHas(p, 'b')).toBe(true)
      const seen: Array<[string, string]> = []
      URLSearchParamsPrototypeForEach(p, (v, k) => seen.push([k, v]))
      expect(seen).toEqual([
        ['a', '1'],
        ['a', '2'],
        ['b', '3'],
      ])
      URLSearchParamsPrototypeDelete(p, 'a')
      expect(URLSearchParamsPrototypeHas(p, 'a')).toBe(false)
    })
  })

  describe('WeakMap (prototype)', () => {
    it('Get / Has / Set / Delete', () => {
      const wm = new WeakMap<object, number>()
      const key = {}
      WeakMapPrototypeSet(wm, key, 42)
      expect(WeakMapPrototypeHas(wm, key)).toBe(true)
      expect(WeakMapPrototypeGet(wm, key)).toBe(42)
      WeakMapPrototypeDelete(wm, key)
      expect(WeakMapPrototypeHas(wm, key)).toBe(false)
    })
  })

  describe('WeakSet (prototype)', () => {
    it('Add / Has / Delete', () => {
      const ws = new WeakSet<object>()
      const key = {}
      WeakSetPrototypeAdd(ws, key)
      expect(WeakSetPrototypeHas(ws, key)).toBe(true)
      WeakSetPrototypeDelete(ws, key)
      expect(WeakSetPrototypeHas(ws, key)).toBe(false)
    })
  })
})
