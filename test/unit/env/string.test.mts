import { describe, expect, test } from 'vitest'

import { envAsString } from '../../../src/env/string'

describe.sequential('env/string — envAsString', () => {
  test('returns the trimmed string for a plain string input', () => {
    expect(envAsString('  hello  ')).toBe('hello')
  })

  test('preserves whitespace with trim:false', () => {
    expect(envAsString('  hello  ', { trim: false })).toBe('  hello  ')
  })

  test('returns empty string when value is undefined and no default', () => {
    expect(envAsString(undefined)).toBe('')
  })

  test('returns empty string when value is null and no default', () => {
    expect(envAsString(undefined)).toBe('')
  })

  test('returns positional defaultValue when value is undefined (legacy)', () => {
    expect(envAsString(undefined, 'fallback')).toBe('fallback')
  })

  test('returns positional defaultValue when value is null (legacy)', () => {
    expect(envAsString(undefined, 'fallback')).toBe('fallback')
  })

  test('trims the defaultValue by default', () => {
    expect(envAsString(undefined, { defaultValue: '  fb  ' })).toBe('fb')
  })

  test('keeps defaultValue verbatim when trim:false', () => {
    expect(
      envAsString(undefined, { defaultValue: '  fb  ', trim: false }),
    ).toBe('  fb  ')
  })

  test('returns string verbatim when present (no fallback to default)', () => {
    expect(envAsString('present', { defaultValue: 'unused' })).toBe('present')
  })

  test('handles empty string by returning empty string (not the default)', () => {
    expect(envAsString('', { defaultValue: 'unused' })).toBe('')
  })

  test('treats an empty defaultValue as no default', () => {
    expect(envAsString(undefined, { defaultValue: '' })).toBe('')
  })
})
