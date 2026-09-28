import { describe, expect, it } from 'vitest'

import { fastNullObject } from '../../../src/objects/options.mjs'

describe('objects/options — fastNullObject', () => {
  it('copies own enumerable values onto a null-prototype object', () => {
    const inherited = { inherited: 'ignored' }
    const input = Object.assign(Object.create(inherited), {
      dry: true,
      verbose: false,
    })

    const options = fastNullObject(input)

    expect(Object.getPrototypeOf(input)).toBe(inherited)
    expect(Object.getPrototypeOf(options)).toBe(null)
    expect(options).toEqual({ dry: true, verbose: false })
    expect('inherited' in options).toBe(false)
  })

  it('preserves an own __proto__ key as data', () => {
    const input = JSON.parse('{"__proto__":{"polluted":true}}') as Record<
      string,
      unknown
    >

    const options = fastNullObject(input)

    expect(Object.getPrototypeOf(options)).toBe(null)
    expect(Object.hasOwn(options, '__proto__')).toBe(true)
    expect(
      Object.getOwnPropertyDescriptor(options, '__proto__')?.value,
    ).toEqual({ polluted: true })
    expect('polluted' in options).toBe(false)
  })

  it('accepts omitted options', () => {
    const options = fastNullObject()

    expect(Object.getPrototypeOf(options)).toBe(null)
    expect(Object.keys(options)).toEqual([])
  })
})
