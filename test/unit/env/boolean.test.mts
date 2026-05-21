import { describe, expect, test } from 'vitest'

import { envAsBoolean } from '../../../src/env/boolean'

describe.sequential('env/boolean — envAsBoolean', () => {
  test('returns true for "true" / "1" / "yes" (case-insensitive)', () => {
    expect(envAsBoolean('true')).toBe(true)
    expect(envAsBoolean('TRUE')).toBe(true)
    expect(envAsBoolean('1')).toBe(true)
    expect(envAsBoolean('yes')).toBe(true)
    expect(envAsBoolean('YES')).toBe(true)
  })

  test('returns false for other strings', () => {
    expect(envAsBoolean('false')).toBe(false)
    expect(envAsBoolean('0')).toBe(false)
    expect(envAsBoolean('no')).toBe(false)
    expect(envAsBoolean('arbitrary')).toBe(false)
  })

  test('trims whitespace by default', () => {
    expect(envAsBoolean('  true  ')).toBe(true)
  })

  test('does not trim when trim:false', () => {
    expect(envAsBoolean('  true  ', { trim: false })).toBe(false)
  })

  test('returns defaultValue (false) for undefined input', () => {
    expect(envAsBoolean(undefined)).toBe(false)
  })

  test('returns positional defaultValue=true for undefined input (legacy)', () => {
    expect(envAsBoolean(undefined, true)).toBe(true)
  })

  test('returns positional defaultValue=true for null input (legacy)', () => {
    expect(envAsBoolean(null, true)).toBe(true)
  })

  test('returns defaultValue via options object', () => {
    expect(envAsBoolean(undefined, { defaultValue: true })).toBe(true)
  })

  test('empty string falls through to defaultValue', () => {
    expect(envAsBoolean('', { defaultValue: true })).toBe(true)
  })

  test('whitespace-only string with default trim hits defaultValue', () => {
    expect(envAsBoolean('   ', { defaultValue: true })).toBe(true)
  })

  test('non-string truthy values coerce to !!value', () => {
    expect(envAsBoolean(1)).toBe(true)
    expect(envAsBoolean(0)).toBe(false)
    expect(envAsBoolean({})).toBe(true)
  })
})
