import { describe, expect, it } from 'vitest'

import {
  compareStr,
  compareStrLengthDesc,
} from '../../../src/sorts/strings.mjs'

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

describe('sorts/strings — compareStrLengthDesc', () => {
  it('puts the longer string first', () => {
    expect(compareStrLengthDesc('abcd', 'ab')).toBeLessThan(0)
    expect(compareStrLengthDesc('ab', 'abcd')).toBeGreaterThan(0)
  })

  it('treats equal lengths as equal', () => {
    expect(compareStrLengthDesc('abc', 'xyz')).toBe(0)
  })

  it('handles empty strings', () => {
    expect(compareStrLengthDesc('', '')).toBe(0)
    expect(compareStrLengthDesc('a', '')).toBeLessThan(0)
  })

  it('sorts a token list longest first', () => {
    const arr = ['ab', 'abcd', 'abc']
    expect(arr.slice().toSorted(compareStrLengthDesc)).toEqual([
      'abcd',
      'abc',
      'ab',
    ])
  })

  it('keeps a prefix token behind its longer sibling', () => {
    const arr = ['qodo-ai', 'qodo-merge-pro', 'qodo']
    expect(arr.slice().toSorted(compareStrLengthDesc)[0]).toBe('qodo-merge-pro')
  })
})
