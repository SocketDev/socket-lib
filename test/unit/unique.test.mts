/**
 * @file Unit tests for src/arrays/unique — arrayUnique.
 */

import { describe, expect, it } from 'vitest'

import { arrayUnique } from '../../src/arrays/unique'

describe('arrayUnique', () => {
  it('should remove duplicate primitive values', () => {
    const arr = [1, 2, 2, 3, 3, 3, 4]
    expect(arrayUnique(arr)).toEqual([1, 2, 3, 4])
  })

  it('should remove duplicate strings', () => {
    const arr = ['a', 'b', 'b', 'c', 'a']
    expect(arrayUnique(arr)).toEqual(['a', 'b', 'c'])
  })

  it('should handle empty arrays', () => {
    expect(arrayUnique([])).toEqual([])
  })

  it('should handle arrays with no duplicates', () => {
    expect(arrayUnique([1, 2, 3, 4])).toEqual([1, 2, 3, 4])
  })

  it('should work with readonly arrays', () => {
    const arr: readonly string[] = ['x', 'y', 'x', 'z']
    expect(arrayUnique(arr)).toEqual(['x', 'y', 'z'])
  })

  it('should handle mixed types', () => {
    const arr = [1, '1', 2, '2', 1, '1']
    expect(arrayUnique(arr)).toEqual([1, '1', 2, '2'])
  })

  it('should preserve first occurrence order', () => {
    const arr = [3, 1, 2, 1, 3, 2]
    expect(arrayUnique(arr)).toEqual([3, 1, 2])
  })

  it('should work with const assertions', () => {
    const arr = [1, 2, 2, 3] as const
    expect(arrayUnique(arr)).toEqual([1, 2, 3])
  })

  it('should handle boolean values', () => {
    const arr = [true, false, true, false, true]
    expect(arrayUnique(arr)).toEqual([true, false])
  })

  it('should handle null and undefined', () => {
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- intentionally testing that null and undefined are distinct values in Set.
    const arr = [null, null, undefined, undefined, 1, null]
    // oxlint-disable-next-line socket/prefer-undefined-over-null -- spec result includes null to verify Set treated it as distinct from undefined
    expect(arrayUnique(arr)).toEqual([null, undefined, 1])
  })

  it('should handle large arrays with duplicates', () => {
    const largeArr = Array.from({ length: 1000 }, (_, i) => i % 100)
    expect(arrayUnique(largeArr).length).toBe(100)
  })
})
