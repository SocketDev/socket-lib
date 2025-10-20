/**
 * @fileoverview Unit tests for array utility functions.
 */

import { describe, expect, it } from 'vitest'
import {
  arrayChunk,
  arrayUnique,
  isArray,
  joinAnd,
  joinOr,
} from '../../../src/lib/arrays'

describe('arrays', () => {
  describe('arrayChunk', () => {
    it('should split array into chunks of specified size', () => {
      const arr = [1, 2, 3, 4, 5, 6]
      const result = arrayChunk(arr, 2)
      expect(result).toEqual([
        [1, 2],
        [3, 4],
        [5, 6],
      ])
    })

    it('should handle uneven chunks', () => {
      const arr = [1, 2, 3, 4, 5]
      const result = arrayChunk(arr, 2)
      expect(result).toEqual([[1, 2], [3, 4], [5]])
    })

    it('should default to chunk size of 2', () => {
      const arr = [1, 2, 3, 4]
      const result = arrayChunk(arr)
      expect(result).toEqual([
        [1, 2],
        [3, 4],
      ])
    })

    it('should handle single element arrays', () => {
      const arr = [1]
      const result = arrayChunk(arr, 3)
      expect(result).toEqual([[1]])
    })

    it('should handle empty arrays', () => {
      const arr: number[] = []
      const result = arrayChunk(arr, 2)
      expect(result).toEqual([])
    })

    it('should throw error for chunk size <= 0', () => {
      const arr = [1, 2, 3]
      expect(() => arrayChunk(arr, 0)).toThrow(
        'Chunk size must be greater than 0',
      )
      expect(() => arrayChunk(arr, -1)).toThrow(
        'Chunk size must be greater than 0',
      )
    })

    it('should handle chunk size larger than array', () => {
      const arr = [1, 2, 3]
      const result = arrayChunk(arr, 10)
      expect(result).toEqual([[1, 2, 3]])
    })

    it('should work with readonly arrays', () => {
      const arr: readonly number[] = [1, 2, 3, 4]
      const result = arrayChunk(arr, 2)
      expect(result).toEqual([
        [1, 2],
        [3, 4],
      ])
    })
  })

  describe('arrayUnique', () => {
    it('should remove duplicate primitive values', () => {
      const arr = [1, 2, 2, 3, 3, 3, 4]
      const result = arrayUnique(arr)
      expect(result).toEqual([1, 2, 3, 4])
    })

    it('should remove duplicate strings', () => {
      const arr = ['a', 'b', 'b', 'c', 'a']
      const result = arrayUnique(arr)
      expect(result).toEqual(['a', 'b', 'c'])
    })

    it('should handle empty arrays', () => {
      const arr: number[] = []
      const result = arrayUnique(arr)
      expect(result).toEqual([])
    })

    it('should handle arrays with no duplicates', () => {
      const arr = [1, 2, 3, 4]
      const result = arrayUnique(arr)
      expect(result).toEqual([1, 2, 3, 4])
    })

    it('should work with readonly arrays', () => {
      const arr: readonly string[] = ['x', 'y', 'x', 'z']
      const result = arrayUnique(arr)
      expect(result).toEqual(['x', 'y', 'z'])
    })

    it('should handle mixed types', () => {
      const arr = [1, '1', 2, '2', 1, '1']
      const result = arrayUnique(arr)
      expect(result).toEqual([1, '1', 2, '2'])
    })
  })

  describe('isArray', () => {
    it('should return true for arrays', () => {
      expect(isArray([])).toBe(true)
      expect(isArray([1, 2, 3])).toBe(true)
      expect(isArray(new Array(5))).toBe(true)
    })

    it('should return false for non-arrays', () => {
      expect(isArray(null)).toBe(false)
      expect(isArray(undefined)).toBe(false)
      expect(isArray({})).toBe(false)
      expect(isArray('array')).toBe(false)
      expect(isArray(123)).toBe(false)
      expect(isArray({ length: 0 })).toBe(false)
    })

    it('should return true for array-like typed arrays', () => {
      expect(isArray(new Uint8Array(0))).toBe(false)
      expect(isArray(new Int32Array(0))).toBe(false)
    })
  })

  describe('joinAnd', () => {
    it('should join two items with "and"', () => {
      const result = joinAnd(['apple', 'banana'])
      expect(result).toBe('apple and banana')
    })

    it('should join three items with commas and "and"', () => {
      const result = joinAnd(['apple', 'banana', 'cherry'])
      expect(result).toBe('apple, banana, and cherry')
    })

    it('should handle single item', () => {
      const result = joinAnd(['apple'])
      expect(result).toBe('apple')
    })

    it('should handle empty array', () => {
      const result = joinAnd([])
      expect(result).toBe('')
    })

    it('should work with readonly arrays', () => {
      const arr: readonly string[] = ['red', 'green', 'blue']
      const result = joinAnd(arr)
      expect(result).toBe('red, green, and blue')
    })

    it('should handle many items', () => {
      const result = joinAnd(['one', 'two', 'three', 'four', 'five'])
      expect(result).toBe('one, two, three, four, and five')
    })
  })

  describe('joinOr', () => {
    it('should join two items with "or"', () => {
      const result = joinOr(['apple', 'banana'])
      expect(result).toBe('apple or banana')
    })

    it('should join three items with commas and "or"', () => {
      const result = joinOr(['apple', 'banana', 'cherry'])
      expect(result).toBe('apple, banana, or cherry')
    })

    it('should handle single item', () => {
      const result = joinOr(['apple'])
      expect(result).toBe('apple')
    })

    it('should handle empty array', () => {
      const result = joinOr([])
      expect(result).toBe('')
    })

    it('should work with readonly arrays', () => {
      const arr: readonly string[] = ['red', 'green', 'blue']
      const result = joinOr(arr)
      expect(result).toBe('red, green, or blue')
    })

    it('should handle many items', () => {
      const result = joinOr(['one', 'two', 'three', 'four', 'five'])
      expect(result).toBe('one, two, three, four, or five')
    })
  })
})
