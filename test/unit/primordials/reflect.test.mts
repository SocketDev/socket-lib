/**
 * @file Unit tests for src/primordials/reflect — Reflect primordials. Split out
 *   of the historical monolithic test/unit/primordials.test.mts.
 */

import { describe, expect, it } from 'vitest'

import { ObjectCreate } from '../../../src/primordials/object'

import {
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
} from '../../../src/primordials/reflect'

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
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- Reflect.setPrototypeOf requires `null` for null-prototype.
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
