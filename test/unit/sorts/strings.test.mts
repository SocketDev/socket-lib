import { describe, expect, it } from 'vitest'

import { compareStr } from '../../../src/sorts/strings'

describe('sorts/strings — compareStr', () => {
  it('compares strings lexicographically', () => {
    expect(compareStr('a', 'b')).toBe(-1)
    expect(compareStr('b', 'a')).toBe(1)
    expect(compareStr('a', 'a')).toBe(0)
  })

  it('is case-sensitive', () => {
    expect(compareStr('A', 'a')).toBe(-1)
    expect(compareStr('a', 'A')).toBe(1)
  })

  it('compares empty strings', () => {
    expect(compareStr('', '')).toBe(0)
    expect(compareStr('', 'a')).toBe(-1)
    expect(compareStr('a', '')).toBe(1)
  })

  it('compares numbers as strings', () => {
    expect(compareStr('10', '2')).toBe(-1)
    expect(compareStr('2', '10')).toBe(1)
  })

  it('sorts strings correctly', () => {
    const arr = ['zebra', 'apple', 'banana', 'Apple']
    const sorted = arr.slice().toSorted(compareStr)
    expect(sorted).toEqual(['Apple', 'apple', 'banana', 'zebra'])
  })

  it('handles special characters', () => {
    expect(compareStr('!', 'a')).toBe(-1)
    expect(compareStr('a', '!')).toBe(1)
  })

  it('handles unicode characters', () => {
    expect(compareStr('café', 'cafe')).toBe(1)
  })

  it('handles multicharacter strings', () => {
    expect(compareStr('abc', 'abd')).toBe(-1)
    expect(compareStr('abd', 'abc')).toBe(1)
    expect(compareStr('abc', 'abc')).toBe(0)
  })
})
