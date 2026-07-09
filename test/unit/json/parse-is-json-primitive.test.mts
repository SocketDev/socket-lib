/**
 * @file Unit tests for src/json/parse — isJsonPrimitive. Split out of
 *   test/unit/json/parse.test.mts to keep each test file under the fleet's
 *   500-line soft cap.
 */

import { describe, expect, it } from 'vitest'

import { isJsonPrimitive } from '../../../src/json/parse'

describe('isJsonPrimitive', () => {
  it('should return true for null', () => {
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- null is a valid JSON primitive value
    expect(isJsonPrimitive(null)).toBe(true)
  })

  it('should return true for boolean values', () => {
    expect(isJsonPrimitive(true)).toBe(true)
    expect(isJsonPrimitive(false)).toBe(true)
  })

  it('should return true for numbers', () => {
    expect(isJsonPrimitive(0)).toBe(true)
    expect(isJsonPrimitive(42)).toBe(true)
    expect(isJsonPrimitive(-1)).toBe(true)
    expect(isJsonPrimitive(3.14)).toBe(true)
    expect(isJsonPrimitive(Number.NaN)).toBe(true)
    expect(isJsonPrimitive(Number.POSITIVE_INFINITY)).toBe(true)
    expect(isJsonPrimitive(Number.NEGATIVE_INFINITY)).toBe(true)
  })

  it('should return true for strings', () => {
    expect(isJsonPrimitive('')).toBe(true)
    expect(isJsonPrimitive('hello')).toBe(true)
    expect(isJsonPrimitive('123')).toBe(true)
  })

  it('should return false for undefined', () => {
    expect(isJsonPrimitive(undefined)).toBe(false)
  })

  it('should return false for objects', () => {
    expect(isJsonPrimitive({})).toBe(false)
    expect(isJsonPrimitive({ key: 'value' })).toBe(false)
  })

  it('should return false for arrays', () => {
    expect(isJsonPrimitive([])).toBe(false)
    expect(isJsonPrimitive([1, 2, 3])).toBe(false)
  })

  it('should return false for functions', () => {
    expect(isJsonPrimitive(() => {})).toBe(false)
  })

  it('should return false for symbols', () => {
    expect(isJsonPrimitive(Symbol('test'))).toBe(false)
  })

  it('should return false for BigInt', () => {
    expect(isJsonPrimitive(BigInt(123))).toBe(false)
  })

  describe('edge cases', () => {
    it('should handle all falsy values correctly', () => {
      // Tests line 200: value === null
      // oxlint-disable-next-line socket/prefer-undefined-over-null -- null is a valid JSON primitive value
      expect(isJsonPrimitive(null)).toBe(true)
      expect(isJsonPrimitive(undefined)).toBe(false)
      expect(isJsonPrimitive(0)).toBe(true)
      expect(isJsonPrimitive(false)).toBe(true)
      expect(isJsonPrimitive('')).toBe(true)
      expect(isJsonPrimitive(Number.NaN)).toBe(true) // NaN is a number
    })

    it('should handle special number values', () => {
      expect(isJsonPrimitive(Number.POSITIVE_INFINITY)).toBe(true)
      expect(isJsonPrimitive(Number.NEGATIVE_INFINITY)).toBe(true)
      expect(isJsonPrimitive(Number.MAX_VALUE)).toBe(true)
      expect(isJsonPrimitive(Number.MIN_VALUE)).toBe(true)
    })
  })
})
