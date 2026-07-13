import { describe, expect, it } from 'vitest'

import {
  localeCompare,
  naturalCompare,
  naturalSorter,
} from '../../../src/sorts/natural'

describe('sorts/natural — localeCompare', () => {
  it('compares strings in locale-aware manner', () => {
    expect(localeCompare('a', 'b')).toBeLessThan(0)
    expect(localeCompare('b', 'a')).toBeGreaterThan(0)
    expect(localeCompare('a', 'a')).toBe(0)
  })

  it('handles case sensitivity', () => {
    expect(localeCompare('A', 'a')).not.toBe(0)
  })

  it('compares empty strings', () => {
    expect(localeCompare('', '')).toBe(0)
    expect(localeCompare('', 'a')).toBeLessThan(0)
    expect(localeCompare('a', '')).toBeGreaterThan(0)
  })

  it('handles special characters', () => {
    expect(localeCompare('café', 'cafe')).not.toBe(0)
  })

  it('sorts strings correctly', () => {
    const arr = ['zebra', 'apple', 'banana']
    const sorted = arr.slice().toSorted(localeCompare)
    expect(sorted).toEqual(['apple', 'banana', 'zebra'])
  })

  it('uses cached collator on subsequent calls', () => {
    const result1 = localeCompare('test1', 'test2')
    const result2 = localeCompare('test1', 'test2')
    expect(result1).toBe(result2)
  })
})

describe('sorts/natural — naturalCompare', () => {
  it('compares strings naturally', () => {
    expect(naturalCompare('a', 'b')).toBeLessThan(0)
    expect(naturalCompare('b', 'a')).toBeGreaterThan(0)
    expect(naturalCompare('a', 'a')).toBe(0)
  })

  it('handles numeric sorting correctly', () => {
    expect(naturalCompare('file2', 'file10')).toBeLessThan(0)
    expect(naturalCompare('file10', 'file2')).toBeGreaterThan(0)
    expect(naturalCompare('2', '10')).toBeLessThan(0)
  })

  it('is case-insensitive', () => {
    expect(naturalCompare('A', 'a')).toBe(0)
    expect(naturalCompare('Apple', 'apple')).toBe(0)
    expect(naturalCompare('ZEBRA', 'zebra')).toBe(0)
  })

  it('handles diacritics as equivalent', () => {
    expect(naturalCompare('a', 'á')).toBe(0)
    expect(naturalCompare('e', 'é')).toBe(0)
  })

  it('sorts files with numbers naturally', () => {
    const arr = ['file10', 'file2', 'file1', 'file20']
    const sorted = arr.slice().toSorted(naturalCompare)
    expect(sorted).toEqual(['file1', 'file2', 'file10', 'file20'])
  })

  it('handles empty strings', () => {
    expect(naturalCompare('', '')).toBe(0)
    expect(naturalCompare('', 'a')).toBeLessThan(0)
    expect(naturalCompare('a', '')).toBeGreaterThan(0)
  })

  it('handles mixed alphanumeric strings', () => {
    const arr = ['v1.2', 'v1.10', 'v1.3']
    const sorted = arr.slice().toSorted(naturalCompare)
    expect(sorted).toEqual(['v1.2', 'v1.3', 'v1.10'])
  })

  it('uses cached collator on subsequent calls', () => {
    const result1 = naturalCompare('test1', 'test2')
    const result2 = naturalCompare('test1', 'test2')
    expect(result1).toBe(result2)
  })
})

describe('sorts/natural — naturalSorter', () => {
  it('sorts array of strings naturally', () => {
    const arr = ['file10', 'file2', 'file1']
    const result = naturalSorter(arr).asc()
    expect(result).toEqual(['file1', 'file2', 'file10'])
  })

  it('sorts in descending order', () => {
    const arr = ['file1', 'file2', 'file10']
    const result = naturalSorter(arr).desc()
    expect(result).toEqual(['file10', 'file2', 'file1'])
  })

  it('handles empty arrays', () => {
    const arr: string[] = []
    const result = naturalSorter(arr).asc()
    expect(result).toEqual([])
  })

  it('handles single element arrays', () => {
    const arr = ['file1']
    const result = naturalSorter(arr).asc()
    expect(result).toEqual(['file1'])
  })

  it('handles objects with selector', () => {
    const arr = [{ name: 'file10' }, { name: 'file2' }, { name: 'file1' }]
    const result = naturalSorter(arr).asc((item: { name: string }) => item.name)
    expect(result).toEqual([
      { name: 'file1' },
      { name: 'file2' },
      { name: 'file10' },
    ])
  })

  it('handles case-insensitive sorting', () => {
    const arr = ['ZEBRA', 'apple', 'Banana']
    const result = naturalSorter(arr).asc()
    expect(result).toEqual(['apple', 'Banana', 'ZEBRA'])
  })

  it('handles duplicates', () => {
    const arr = ['file2', 'file1', 'file2', 'file3']
    const result = naturalSorter(arr).asc()
    expect(result).toEqual(['file1', 'file2', 'file2', 'file3'])
  })

  it('uses cached sorter on subsequent calls', () => {
    const arr1 = ['file2', 'file1']
    const result1 = naturalSorter(arr1).asc()
    const arr2 = ['file10', 'file5']
    const result2 = naturalSorter(arr2).asc()
    expect(result1).toEqual(['file1', 'file2'])
    expect(result2).toEqual(['file5', 'file10'])
  })

  it('handles numeric-only strings', () => {
    const arr = ['100', '20', '3', '1']
    const result = naturalSorter(arr).asc()
    expect(result).toEqual(['1', '3', '20', '100'])
  })

  it('does not mutate original array', () => {
    const arr = ['file10', 'file2', 'file1']
    const original = [...arr]
    naturalSorter(arr).asc()
    expect(arr).toEqual(original)
  })
})
