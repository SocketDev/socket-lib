/**
 * @file Unit tests for src/arrays/predicates — isArray.
 */

import { describe, expect, it } from 'vitest'

import { isArray } from '../../src/arrays/predicates'

describe('isArray', () => {
  it('should return true for arrays', () => {
    expect(isArray([])).toBe(true)
    expect(isArray([1, 2, 3])).toBe(true)
    // oxlint-disable-next-line unicorn/no-new-array -- testing that new Array() is correctly identified as an array
    expect(isArray(new Array(5))).toBe(true)
  })

  it('should return false for non-arrays', () => {
    expect(isArray(undefined)).toBe(false)
    expect(isArray(undefined)).toBe(false)
    expect(isArray({})).toBe(false)
    expect(isArray('array')).toBe(false)
    expect(isArray(123)).toBe(false)
    expect(isArray({ length: 0 })).toBe(false)
  })

  it('should return false for typed arrays (not plain arrays)', () => {
    expect(isArray(new Uint8Array(0))).toBe(false)
    expect(isArray(new Int32Array(0))).toBe(false)
  })
})
