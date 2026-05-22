import { describe, expect, test } from 'vitest'

import { envAsNumber } from '../../../src/env/number'

describe.sequential('env/number — envAsNumber (default int mode)', () => {
  test('parses an integer string', () => {
    expect(envAsNumber('3000')).toBe(3000)
  })

  test('returns 0 for unparseable strings', () => {
    expect(envAsNumber('abc')).toBe(0)
  })

  test('returns 0 for undefined with no default', () => {
    expect(envAsNumber(undefined)).toBe(0)
  })

  test('returns 0 for null with no default', () => {
    expect(envAsNumber(undefined)).toBe(0)
  })

  test('returns positional defaultValue for undefined (legacy)', () => {
    expect(envAsNumber(undefined, 42)).toBe(42)
  })

  test('returns positional defaultValue for null (legacy)', () => {
    expect(envAsNumber(undefined, 42)).toBe(42)
  })

  test('returns defaultValue via options', () => {
    expect(envAsNumber(undefined, { defaultValue: 99 })).toBe(99)
  })

  test('empty string falls through to defaultValue', () => {
    expect(envAsNumber('', { defaultValue: 42 })).toBe(42)
  })

  test('parseInt-style: takes the leading integer of mixed strings', () => {
    // `parseInt('3000abc', 10)` returns 3000.
    expect(envAsNumber('3000abc')).toBe(3000)
  })
})

describe.sequential('env/number — float mode', () => {
  test('parses a decimal string', () => {
    expect(envAsNumber('3.14', { mode: 'float' })).toBe(3.14)
  })

  test('returns defaultValue for non-numeric strings in float mode', () => {
    expect(envAsNumber('abc', { defaultValue: 99, mode: 'float' })).toBe(99)
  })

  test('strict float: "3000abc" is NaN → defaultValue', () => {
    // Number('3000abc') is NaN (unlike parseInt).
    expect(envAsNumber('3000abc', { mode: 'float', defaultValue: 7 })).toBe(7)
  })

  test('treats null defaultValueOrOptions as no-options', () => {
    // Explicit null exercises the `defaultValueOrOptions ?? {}` branch.
    const nullValue = JSON.parse('null') as unknown
    expect(envAsNumber('42', nullValue as Parameters<typeof envAsNumber>[1])).toBe(42)
  })

  test('treats null value as undefined (returns defaultValue)', () => {
    const nullValue = JSON.parse('null') as unknown
    expect(
      envAsNumber(nullValue as Parameters<typeof envAsNumber>[0], 99),
    ).toBe(99)
  })
})
