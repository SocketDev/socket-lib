import { describe, expect, it } from 'vitest'

import { createFastOptions } from '../../../src/objects/options.mjs'

describe('objects/options — createFastOptions', () => {
  it('copies own enumerable values onto a null-prototype object', () => {
    const inherited = { inherited: 'ignored' }
    const input = Object.assign(Object.create(inherited), {
      dry: true,
      verbose: false,
    })

    const options = createFastOptions(input)

    expect(Object.getPrototypeOf(options)).toBe(null)
    expect(options).toEqual({ dry: true, verbose: false })
    expect('inherited' in options).toBe(false)
  })

  it('preserves an own __proto__ key as data', () => {
    const input = JSON.parse('{"__proto__":{"polluted":true}}') as Record<
      string,
      unknown
    >

    const options = createFastOptions(input)

    expect(Object.getPrototypeOf(options)).toBe(null)
    expect(Object.hasOwn(options, '__proto__')).toBe(true)
    expect(
      Object.getOwnPropertyDescriptor(options, '__proto__')?.value,
    ).toEqual({ polluted: true })
    expect('polluted' in options).toBe(false)
  })

  it('accepts omitted options', () => {
    const options = createFastOptions()

    expect(Object.getPrototypeOf(options)).toBe(null)
    expect(Object.keys(options)).toEqual([])
  })
})
