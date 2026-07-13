/**
 * @file Unit tests for src/arrays/chunk — arrayChunk.
 */

import { describe, expect, it } from 'vitest'

import { arrayChunk } from '../../src/arrays/chunk'

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

  it('should handle strings', () => {
    const arr = ['a', 'b', 'c', 'd', 'e']
    const result = arrayChunk(arr, 3)
    expect(result).toEqual([
      ['a', 'b', 'c'],
      ['d', 'e'],
    ])
  })

  it('should work with const assertions', () => {
    const arr = [1, 2, 3, 4] as const
    const result = arrayChunk(arr, 2)
    expect(result).toEqual([
      [1, 2],
      [3, 4],
    ])
  })

  it('should handle chunk size of 1', () => {
    const arr = [1, 2, 3, 4, 5]
    const result = arrayChunk(arr, 1)
    expect(result).toEqual([[1], [2], [3], [4], [5]])
  })

  it('should handle large arrays efficiently', () => {
    const largeArr = Array.from({ length: 1000 }, (_, i) => i)
    const result = arrayChunk(largeArr, 10)
    expect(result.length).toBe(100)
    expect(result[0]).toEqual([0, 1, 2, 3, 4, 5, 6, 7, 8, 9])
    expect(result[99]).toEqual([
      990, 991, 992, 993, 994, 995, 996, 997, 998, 999,
    ])
  })
})
