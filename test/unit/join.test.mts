/**
 * @file Unit tests for src/arrays/join — joinAnd, joinOr, joinList.
 */

import { describe, expect, it } from 'vitest'

import { joinAnd, joinList, joinOr } from '../../src/arrays/join'

describe('joinList', () => {
  it('bare join (no options): concatenates items', () => {
    expect(joinList(['dis', 'regard'])).toBe('disregard')
  })

  it('bare join (empty object): concatenates items', () => {
    expect(joinList(['dis', 'regard'], {})).toBe('disregard')
  })

  it('with comma-space: three items', () => {
    expect(joinList(['a', 'b', 'c'], { with: ', ' })).toBe('a, b, c')
  })

  it('with comma-space: two items', () => {
    expect(joinList(['a', 'b'], { with: ', ' })).toBe('a, b')
  })

  it('with comma-space: single item', () => {
    expect(joinList(['a'], { with: ', ' })).toBe('a')
  })

  it('with comma-space: empty array', () => {
    expect(joinList([], { with: ', ' })).toBe('')
  })

  it('with space: three items', () => {
    expect(joinList(['a', 'b', 'c'], { with: ' ' })).toBe('a b c')
  })

  it('with and: three items', () => {
    expect(joinList(['a', 'b', 'c'], { with: 'and' })).toBe('a, b, and c')
  })

  it('with and: two items', () => {
    expect(joinList(['a', 'b'], { with: 'and' })).toBe('a and b')
  })

  it('with or: three items', () => {
    expect(joinList(['a', 'b', 'c'], { with: 'or' })).toBe('a, b, or c')
  })

  it('with or: two items', () => {
    expect(joinList(['a', 'b'], { with: 'or' })).toBe('a or b')
  })

  it('single item: all modes return item', () => {
    expect(joinList(['x'])).toBe('x')
    expect(joinList(['x'], { with: ', ' })).toBe('x')
    expect(joinList(['x'], { with: 'and' })).toBe('x')
    expect(joinList(['x'], { with: 'or' })).toBe('x')
  })

  it('empty array: all modes return empty string', () => {
    expect(joinList([])).toBe('')
    expect(joinList([], { with: ', ' })).toBe('')
    expect(joinList([], { with: 'and' })).toBe('')
    expect(joinList([], { with: 'or' })).toBe('')
  })

  it('non-string items with and', () => {
    expect(joinList([1, 2, 3], { with: 'and' })).toBe('1, 2, and 3')
  })

  it('non-string items bare join', () => {
    expect(joinList([1, 2, 3])).toBe('123')
  })

  it('works with readonly arrays and const assertions', () => {
    const arr = ['a', 'b', 'c'] as const
    expect(joinList(arr, { with: 'and' })).toBe('a, b, and c')
  })

  it('joinAnd delegates to joinList', () => {
    expect(joinAnd(['a', 'b'])).toBe('a and b')
  })

  it('joinOr delegates to joinList', () => {
    expect(joinOr(['a', 'b'])).toBe('a or b')
  })
})

describe('joinAnd', () => {
  it('should join two items with "and"', () => {
    expect(joinAnd(['apple', 'banana'])).toBe('apple and banana')
  })

  it('should join three items with commas and "and"', () => {
    expect(joinAnd(['apple', 'banana', 'cherry'])).toBe(
      'apple, banana, and cherry',
    )
  })

  it('should handle single item', () => {
    expect(joinAnd(['apple'])).toBe('apple')
  })

  it('should handle empty array', () => {
    expect(joinAnd([])).toBe('')
  })

  it('should work with readonly arrays', () => {
    const arr: readonly string[] = ['red', 'green', 'blue']
    expect(joinAnd(arr)).toBe('red, green, and blue')
  })

  it('should handle many items', () => {
    expect(joinAnd(['one', 'two', 'three', 'four', 'five'])).toBe(
      'one, two, three, four, and five',
    )
  })

  it('should handle special characters', () => {
    expect(joinAnd(['🍎', '🍌', '🍒'])).toBe('🍎, 🍌, and 🍒')
  })

  it('should handle numbers as strings', () => {
    expect(joinAnd(['1', '2', '3'])).toBe('1, 2, and 3')
  })

  it('should work with const assertions', () => {
    const arr = ['a', 'b', 'c'] as const
    expect(joinAnd(arr)).toBe('a, b, and c')
  })

  it('should reuse conjunction formatter across calls', () => {
    const result1 = joinAnd(['a', 'b'])
    const result2 = joinAnd(['c', 'd'])
    expect(result1).toBe('a and b')
    expect(result2).toBe('c and d')
  })

  it('should handle numbers coerced to strings', () => {
    expect(joinAnd(['1', '2', '3', '4', '5', '6'])).toBe('1, 2, 3, 4, 5, and 6')
  })
})

describe('joinOr', () => {
  it('should join two items with "or"', () => {
    expect(joinOr(['apple', 'banana'])).toBe('apple or banana')
  })

  it('should join three items with commas and "or"', () => {
    expect(joinOr(['apple', 'banana', 'cherry'])).toBe(
      'apple, banana, or cherry',
    )
  })

  it('should handle single item', () => {
    expect(joinOr(['apple'])).toBe('apple')
  })

  it('should handle empty array', () => {
    expect(joinOr([])).toBe('')
  })

  it('should work with readonly arrays', () => {
    const arr: readonly string[] = ['red', 'green', 'blue']
    expect(joinOr(arr)).toBe('red, green, or blue')
  })

  it('should handle many items', () => {
    expect(joinOr(['one', 'two', 'three', 'four', 'five'])).toBe(
      'one, two, three, four, or five',
    )
  })

  it('should handle special characters', () => {
    expect(joinOr(['#ff0000', '#00ff00', '#0000ff'])).toBe(
      '#ff0000, #00ff00, or #0000ff',
    )
  })

  it('should handle numbers as strings', () => {
    expect(joinOr(['100', '200', '300'])).toBe('100, 200, or 300')
  })

  it('should work with const assertions', () => {
    const arr = ['x', 'y', 'z'] as const
    expect(joinOr(arr)).toBe('x, y, or z')
  })

  it('should reuse disjunction formatter across calls', () => {
    const result1 = joinOr(['a', 'b'])
    const result2 = joinOr(['c', 'd'])
    expect(result1).toBe('a or b')
    expect(result2).toBe('c or d')
  })

  it('should handle long lists', () => {
    const arr = Array.from({ length: 10 }, (_, i) => `item${i}`)
    const result = joinOr(arr)
    expect(result).toContain('or')
    expect(result).toContain('item0')
    expect(result).toContain('item9')
  })
})
