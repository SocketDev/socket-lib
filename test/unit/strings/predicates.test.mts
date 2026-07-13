import { describe, expect, it } from 'vitest'

import {
  isBlankString,
  isNonEmptyString,
} from '../../../src/strings/predicates'

describe('strings/predicates — isBlankString', () => {
  it('returns true for empty string', () => {
    expect(isBlankString('')).toBe(true)
  })

  it('returns true for whitespace-only strings', () => {
    expect(isBlankString(' ')).toBe(true)
    expect(isBlankString('  ')).toBe(true)
    expect(isBlankString('\t')).toBe(true)
    expect(isBlankString('\n')).toBe(true)
    expect(isBlankString(' \t\n ')).toBe(true)
  })

  it('returns false for non-empty strings', () => {
    expect(isBlankString('hello')).toBe(false)
    expect(isBlankString(' hello ')).toBe(false)
  })

  it('returns false for non-strings', () => {
    expect(isBlankString(undefined)).toBe(false)
    expect(isBlankString(123)).toBe(false)
    expect(isBlankString({})).toBe(false)
  })

  it('handles various whitespace types', () => {
    expect(isBlankString(' \t\n\r ')).toBe(true)
    expect(isBlankString('\n\n\n')).toBe(true)
    expect(isBlankString('\t\t\t')).toBe(true)
  })

  it('returns false for non-blank strings', () => {
    expect(isBlankString(' a ')).toBe(false)
    expect(isBlankString('  \n  x  ')).toBe(false)
  })

  it('tests empty length first', () => {
    expect(isBlankString('')).toBe(true)
  })

  it('tests whitespace regex for non-empty', () => {
    expect(isBlankString('   ')).toBe(true)
    expect(isBlankString('\t\n')).toBe(true)
  })

  it('returns false for non-whitespace', () => {
    expect(isBlankString('a')).toBe(false)
  })
})

describe('strings/predicates — isNonEmptyString', () => {
  it('returns true for non-empty strings', () => {
    expect(isNonEmptyString('hello')).toBe(true)
    expect(isNonEmptyString(' ')).toBe(true)
    expect(isNonEmptyString('a')).toBe(true)
    expect(isNonEmptyString('0')).toBe(true)
  })

  it('returns false for empty string', () => {
    expect(isNonEmptyString('')).toBe(false)
  })

  it('returns false for non-strings', () => {
    expect(isNonEmptyString(undefined)).toBe(false)
    expect(isNonEmptyString(123)).toBe(false)
    expect(isNonEmptyString([])).toBe(false)
    expect(isNonEmptyString({})).toBe(false)
  })
})
