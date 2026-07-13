import { describe, expect, it } from 'vitest'

import { search } from '../../../src/strings/search'

describe('strings/search — search', () => {
  it('finds pattern from beginning', () => {
    expect(search('hello world', /world/)).toBe(6)
  })

  it('finds pattern from custom index', () => {
    expect(search('hello hello', /hello/, { fromIndex: 1 })).toBe(6)
  })

  it('returns -1 when pattern not found', () => {
    expect(search('hello', /goodbye/)).toBe(-1)
  })

  it('handles negative fromIndex', () => {
    expect(search('hello world', /world/, { fromIndex: -5 })).toBe(6)
  })

  it('returns -1 when fromIndex >= length', () => {
    expect(search('hello', /hello/, { fromIndex: 10 })).toBe(-1)
  })

  it('handles empty string', () => {
    expect(search('', /test/)).toBe(-1)
  })

  it('handles fromIndex at exact match position', () => {
    expect(search('hello', /hello/, { fromIndex: 0 })).toBe(0)
  })

  it('handles fromIndex past all matches', () => {
    expect(search('hello world', /hello/, { fromIndex: 10 })).toBe(-1)
  })

  it('handles very negative fromIndex', () => {
    expect(search('hello', /hello/, { fromIndex: -1000 })).toBe(0)
  })

  it('handles regex with flags', () => {
    expect(search('Hello', /hello/i)).toBe(0)
  })

  it('handles global regex', () => {
    expect(search('test test', /test/g, { fromIndex: 5 })).toBe(5)
  })

  it('returns -1 when fromIndex > length (branch)', () => {
    expect(search('test', /t/, { fromIndex: 10 })).toBe(-1)
    expect(search('test', /t/, { fromIndex: 4 })).toBe(-1)
  })

  it('matches a zero-width pattern at fromIndex === length', () => {
    expect(search('abc', /c?/, { fromIndex: 3 })).toBe(3)
    expect(search('abc', /$/, { fromIndex: 3 })).toBe(3)
    expect(search('', /x?/)).toBe(0)
  })

  it('handles negative fromIndex (branch)', () => {
    expect(search('hello world', /world/, { fromIndex: -5 })).toBe(6)
    expect(search('test', /t/, { fromIndex: -2 })).toBe(3)
  })

  it('handles very large negative fromIndex', () => {
    expect(search('test', /t/, { fromIndex: -100 })).toBe(0)
  })

  it('uses fast path when fromIndex === 0', () => {
    expect(search('hello', /l/, { fromIndex: 0 })).toBe(2)
  })

  it('calculates offset for positive fromIndex', () => {
    expect(search('hello', /l/, { fromIndex: 3 })).toBe(3)
  })

  it('calculates offset for negative fromIndex', () => {
    const result = search('hello world', /o/, { fromIndex: -6 })
    expect(result).toBeGreaterThanOrEqual(0)
  })

  it('handles result === -1 in offset calculation', () => {
    expect(search('hello', /z/, { fromIndex: 2 })).toBe(-1)
  })

  it('finds pattern with fromIndex', () => {
    const result = search('hello world hello', /hello/, { fromIndex: 6 })
    expect(result).toBe(12)
  })

  it('returns -1 when not found after fromIndex', () => {
    const result = search('hello world', /hello/, { fromIndex: 6 })
    expect(result).toBe(-1)
  })

  it('handles fromIndex of 0 (no-op)', () => {
    const result = search('test string', /test/, { fromIndex: 0 })
    expect(result).toBe(0)
  })

  it('handles negative fromIndex by converting to positive', () => {
    const result = search('test string', /test/, { fromIndex: -100 })
    expect(result).toBe(0)
  })

  it('works without options object', () => {
    const result = search('test string', /string/)
    expect(result).toBe(5)
  })
})
