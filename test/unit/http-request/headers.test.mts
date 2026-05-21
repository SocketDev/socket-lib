import { describe, expect, test } from 'vitest'

import {
  parseRetryAfterHeader,
  sanitizeHeaders,
} from '../../../src/http-request/headers'

describe.sequential('http-request/headers — parseRetryAfterHeader', () => {
  test('returns undefined for undefined input', () => {
    expect(parseRetryAfterHeader(undefined)).toBeUndefined()
  })

  test('returns undefined for empty string', () => {
    expect(parseRetryAfterHeader('')).toBeUndefined()
  })

  test('returns undefined for empty array', () => {
    expect(parseRetryAfterHeader([])).toBeUndefined()
  })

  test('returns undefined for array whose first element is empty', () => {
    expect(parseRetryAfterHeader([''])).toBeUndefined()
  })

  test('returns ms when value is a positive integer string of seconds', () => {
    expect(parseRetryAfterHeader('120')).toBe(120_000)
  })

  test('returns ms for "0" seconds', () => {
    expect(parseRetryAfterHeader('0')).toBe(0)
  })

  test('uses first element when value is an array', () => {
    expect(parseRetryAfterHeader(['60', '999'])).toBe(60_000)
  })

  test('handles whitespace around the integer', () => {
    expect(parseRetryAfterHeader('  42  ')).toBe(42_000)
  })

  test('rejects partial-numeric strings (e.g. "10abc")', () => {
    // Falls through to HTTP-date parsing which also rejects it.
    expect(parseRetryAfterHeader('10abc')).toBeUndefined()
  })

  test('parses an HTTP date in the far future as a positive ms delay', () => {
    // The lib's primordial DateCtor doesn't respond to vi.useFakeTimers; use
    // a date guaranteed to be far in the future relative to the real clock.
    const farFuture = new Date(Date.now() + 60 * 60 * 1000).toUTCString()
    const result = parseRetryAfterHeader(farFuture)
    expect(result).toBeGreaterThan(0)
    expect(result).toBeLessThanOrEqual(60 * 60 * 1000)
  })

  test('returns undefined for an HTTP date in the past', () => {
    expect(
      parseRetryAfterHeader('Mon, 01 Jan 2001 00:00:00 GMT'),
    ).toBeUndefined()
  })

  test('returns undefined for unparseable date strings', () => {
    expect(parseRetryAfterHeader('not-a-date-or-number')).toBeUndefined()
  })
})

describe.sequential('http-request/headers — sanitizeHeaders', () => {
  test('returns empty object for undefined input', () => {
    expect(sanitizeHeaders(undefined)).toEqual({})
  })

  test('returns empty object for empty input', () => {
    expect(sanitizeHeaders({})).toEqual({})
  })

  test('redacts the authorization header', () => {
    expect(sanitizeHeaders({ authorization: 'Bearer secret-token' })).toEqual({
      authorization: '[REDACTED]',
    })
  })

  test('redacts cookie / set-cookie / proxy variants', () => {
    expect(
      sanitizeHeaders({
        cookie: 'session=abc',
        'set-cookie': 'session=def',
        'proxy-authorization': 'Basic xyz',
        'proxy-authenticate': 'Negotiate',
        'www-authenticate': 'Bearer realm="x"',
      }),
    ).toEqual({
      cookie: '[REDACTED]',
      'set-cookie': '[REDACTED]',
      'proxy-authorization': '[REDACTED]',
      'proxy-authenticate': '[REDACTED]',
      'www-authenticate': '[REDACTED]',
    })
  })

  test('case-insensitive match against the sensitive set', () => {
    expect(
      sanitizeHeaders({
        Authorization: 'Bearer x',
        COOKIE: 'session=y',
      }),
    ).toEqual({
      Authorization: '[REDACTED]',
      COOKIE: '[REDACTED]',
    })
  })

  test('preserves non-sensitive headers verbatim', () => {
    expect(
      sanitizeHeaders({
        'content-type': 'application/json',
        'x-trace-id': 'abc-123',
      }),
    ).toEqual({
      'content-type': 'application/json',
      'x-trace-id': 'abc-123',
    })
  })

  test('joins array values with ", "', () => {
    expect(
      sanitizeHeaders({ accept: ['text/html', 'application/json'] }),
    ).toEqual({
      accept: 'text/html, application/json',
    })
  })

  test('coerces number values to string', () => {
    expect(sanitizeHeaders({ 'content-length': 1024 })).toEqual({
      'content-length': '1024',
    })
  })

  test('skips undefined / null values', () => {
    expect(
      sanitizeHeaders({
        good: 'kept',
        missing: undefined,
        nullish: undefined,
      }),
    ).toEqual({ good: 'kept' })
  })
})
