/**
 * @file Unit tests for src/primordials/number — Number primordials. Split out
 *   of the historical monolithic test/unit/primordials.test.mts.
 */

import { describe, expect, it } from 'vitest'

import {
  NumberEPSILON,
  NumberIsFinite,
  NumberIsInteger,
  NumberIsNaN,
  NumberIsSafeInteger,
  NumberMAX_SAFE_INTEGER,
  NumberMAX_VALUE,
  NumberMIN_SAFE_INTEGER,
  NumberMIN_VALUE,
  NumberNEGATIVE_INFINITY,
  NumberParseFloat,
  NumberParseInt,
  NumberPOSITIVE_INFINITY,
  NumberPrototypeToFixed,
  NumberPrototypeToString,
} from '../../../src/primordials/number'

describe('Number', () => {
  it('static predicates', () => {
    expect(NumberIsFinite(1)).toBe(true)
    expect(NumberIsFinite(Infinity)).toBe(false)
    expect(NumberIsInteger(1)).toBe(true)
    expect(NumberIsInteger(1.1)).toBe(false)
    expect(NumberIsNaN(Number.NaN)).toBe(true)
    expect(NumberIsSafeInteger(2 ** 53 - 1)).toBe(true)
    expect(NumberIsSafeInteger(2 ** 53)).toBe(false)
  })

  it('parseFloat / parseInt', () => {
    expect(NumberParseFloat('3.14')).toBeCloseTo(3.14)
    expect(NumberParseInt('42', 10)).toBe(42)
  })

  it('parseInt with omitted radix matches radix-10', () => {
    // The smol-aware wrapper routes radix=10 (and omitted) through
    // the Fast API path. Radix 16 / 2 / 8 fall back to stock parseInt.
    expect(NumberParseInt('42')).toBe(42)
    expect(NumberParseInt('  -7')).toBe(-7)
    expect(NumberParseInt('+99')).toBe(99)
    expect(NumberParseInt('123abc')).toBe(123)
    expect(NumberParseInt('abc')).toBeNaN()
    expect(NumberParseInt('')).toBeNaN()
  })

  it('parseInt with non-10 radix falls through to stock', () => {
    expect(NumberParseInt('ff', 16)).toBe(255)
    expect(NumberParseInt('1010', 2)).toBe(10)
    expect(NumberParseInt('17', 8)).toBe(15)
  })

  it('parseFloat handles signs, exponents, leading whitespace', () => {
    expect(NumberParseFloat('  -3.14e2')).toBeCloseTo(-314)
    expect(NumberParseFloat('+1.5')).toBe(1.5)
    expect(NumberParseFloat('Infinity')).toBe(Infinity)
    expect(NumberParseFloat('-Infinity')).toBe(-Infinity)
    expect(NumberParseFloat('not-a-number')).toBeNaN()
  })

  it('exposes Number constants with the correct values', () => {
    expect(NumberEPSILON).toBe(Number.EPSILON)
    expect(NumberMAX_SAFE_INTEGER).toBe(Number.MAX_SAFE_INTEGER)
    expect(NumberMAX_VALUE).toBe(Number.MAX_VALUE)
    expect(NumberMIN_SAFE_INTEGER).toBe(Number.MIN_SAFE_INTEGER)
    expect(NumberMIN_VALUE).toBe(Number.MIN_VALUE)
    expect(NumberNEGATIVE_INFINITY).toBe(Number.NEGATIVE_INFINITY)
    expect(NumberPOSITIVE_INFINITY).toBe(Number.POSITIVE_INFINITY)
  })

  it('prototype toFixed / toString via uncurry', () => {
    expect(NumberPrototypeToFixed(3.14159, 2)).toBe('3.14')
    expect(NumberPrototypeToString(255, 16)).toBe('ff')
  })
})
