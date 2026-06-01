import { describe, expect, test } from 'vitest'

import {
  Instant,
  describe as describeValue,
  isValidEpochNanoseconds,
} from '../../../src/temporal/instant'

const NS_MAX_INSTANT = 8_640_000_000_000_000_000_000n
const NS_MIN_INSTANT = -NS_MAX_INSTANT

describe.sequential('temporal/instant — isValidEpochNanoseconds', () => {
  test('accepts 0n (Unix epoch)', () => {
    expect(isValidEpochNanoseconds(0n)).toBe(true)
  })

  test('accepts the boundary maximum', () => {
    expect(isValidEpochNanoseconds(NS_MAX_INSTANT)).toBe(true)
  })

  test('accepts the boundary minimum', () => {
    expect(isValidEpochNanoseconds(NS_MIN_INSTANT)).toBe(true)
  })

  test('rejects one nanosecond past the maximum', () => {
    expect(isValidEpochNanoseconds(NS_MAX_INSTANT + 1n)).toBe(false)
  })

  test('rejects one nanosecond past the minimum', () => {
    expect(isValidEpochNanoseconds(NS_MIN_INSTANT - 1n)).toBe(false)
  })

  test('accepts a typical present-day timestamp', () => {
    // ~2026-01-01T00:00:00Z in nanoseconds.
    const someTime2026Ns = 1_767_225_600_000_000_000n
    expect(isValidEpochNanoseconds(someTime2026Ns)).toBe(true)
  })
})

describe.sequential('temporal/instant — Instant constructor', () => {
  test('accepts a bigint literal', () => {
    const inst = new Instant(0n)
    expect(inst.epochNanoseconds).toBe(0n)
  })

  test('accepts a numeric string', () => {
    const inst = new Instant('1700000000000000000')
    expect(inst.epochNanoseconds).toBe(1_700_000_000_000_000_000n)
  })

  test('accepts a Number that fits the spec range', () => {
    // Note: JS Number can lose precision beyond 2^53, but the constructor's
    // contract is "coercible to BigInt", which Number(0) → BigInt(0) is.
    const inst = new Instant(0)
    expect(inst.epochNanoseconds).toBe(0n)
  })

  test('throws TypeError on a non-coercible value', () => {
    expect(() => new Instant('not-a-number' as unknown as bigint)).toThrow(
      /must be coercible to BigInt/,
    )
  })

  test('throws RangeError when bigint is past the maximum', () => {
    expect(() => new Instant(NS_MAX_INSTANT + 1n)).toThrow(/out of range/)
  })

  test('throws RangeError when bigint is past the minimum', () => {
    expect(() => new Instant(NS_MIN_INSTANT - 1n)).toThrow(/out of range/)
  })

  test('accepts the maximum boundary', () => {
    expect(new Instant(NS_MAX_INSTANT).epochNanoseconds).toBe(NS_MAX_INSTANT)
  })

  test('accepts the minimum boundary', () => {
    expect(new Instant(NS_MIN_INSTANT).epochNanoseconds).toBe(NS_MIN_INSTANT)
  })
})

describe.sequential('temporal/instant — epochNanoseconds getter', () => {
  test('returns the bigint stored at construction', () => {
    const ns = 1_234_567_890_123_456_789n
    expect(new Instant(ns).epochNanoseconds).toBe(ns)
  })

  test('throws TypeError when called on a non-Instant receiver', () => {
    // Access the getter descriptor and call it with a wrong `this`.
    const desc = Object.getOwnPropertyDescriptor(
      Instant.prototype,
      'epochNanoseconds',
    )!
    expect(() => desc.get!.call({})).toThrow(/InitializedTemporalInstant/)
  })
})

describe.sequential('temporal/instant — describe (value formatter)', () => {
  test('returns "null" for null', () => {
    // Avoid `null` literal in source (no-null rule) by deriving it via JSON.parse.
    const nullValue = JSON.parse('null') as unknown
    expect(describeValue(nullValue)).toBe('null')
  })

  test('appends "n" to bigint values', () => {
    expect(describeValue(42n)).toBe('42n')
  })

  test('returns <ConstructorName> for object instances with a named constructor', () => {
    class MyClass {}
    expect(describeValue(new MyClass())).toBe('<MyClass>')
  })

  test('returns <object> for a plain object created via Object.create(null)', () => {
    expect(describeValue(Object.create(null))).toBe('<object>')
  })

  test('JSON-encodes strings', () => {
    expect(describeValue('hi')).toBe('"hi"')
  })

  test('String-coerces numbers', () => {
    expect(describeValue(42)).toBe('42')
    expect(describeValue(true)).toBe('true')
    expect(describeValue(undefined)).toBe('undefined')
  })
})
