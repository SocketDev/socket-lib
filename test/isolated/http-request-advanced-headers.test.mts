/**
 * @file Unit tests for HTTP/HTTPS request utilities — header utilities surface.
 *   Covers parseRetryAfterHeader and sanitizeHeaders. Split from
 *   http-request-advanced-2.test.mts to keep each test file under the file-size
 *   cap and scoped to a single domain (header parsing/redaction). Shares the
 *   test server with the sibling http-request-*.test.mts files via
 *   http-request-fixtures.
 */

import { describe, expect, it } from 'vitest'

import {
  parseRetryAfterHeader,
  sanitizeHeaders,
} from '../../src/http-request/headers'

import { setupHttpFixture } from './http-request-fixtures'

setupHttpFixture()

describe('http-request', () => {
  describe('parseRetryAfterHeader', () => {
    it('should parse integer seconds', () => {
      expect(parseRetryAfterHeader('120')).toBe(120_000)
    })

    it('should parse zero seconds', () => {
      expect(parseRetryAfterHeader('0')).toBe(0)
    })

    it('should return undefined for undefined input', () => {
      expect(parseRetryAfterHeader(undefined)).toBeUndefined()
    })

    it('should return undefined for empty string', () => {
      expect(parseRetryAfterHeader('')).toBeUndefined()
    })

    it('should return undefined for empty array', () => {
      expect(parseRetryAfterHeader([])).toBeUndefined()
    })

    it('should take first value from array', () => {
      expect(parseRetryAfterHeader(['60', '120'])).toBe(60_000)
    })

    it('should parse future HTTP-date', () => {
      const future = new Date(Date.now() + 5000).toUTCString()
      const result = parseRetryAfterHeader(future)!

      expect(result).toBeGreaterThan(0)
      expect(result).toBeLessThanOrEqual(6000)
    })

    it('should return undefined for past HTTP-date', () => {
      const past = new Date(Date.now() - 60_000).toUTCString()
      expect(parseRetryAfterHeader(past)).toBeUndefined()
    })

    it('should return undefined for negative seconds', () => {
      expect(parseRetryAfterHeader('-5')).toBeUndefined()
    })

    it('should return undefined for non-parseable string', () => {
      expect(parseRetryAfterHeader('not-a-number-or-date')).toBeUndefined()
    })
  })

  describe('sanitizeHeaders', () => {
    it('should redact authorization header', () => {
      const result = sanitizeHeaders({
        authorization: 'Bearer secret-token',
        'content-type': 'application/json',
      })

      expect(result['authorization']).toBe('[REDACTED]')
      expect(result['content-type']).toBe('application/json')
    })

    it('should redact all sensitive headers', () => {
      const result = sanitizeHeaders({
        authorization: 'Bearer token',
        cookie: 'session=abc',
        'set-cookie': 'session=abc; Path=/',
        'proxy-authorization': 'Basic xyz',
        'proxy-authenticate': 'Basic',
        'www-authenticate': 'Bearer',
      })

      for (const value of Object.values(result)) {
        expect(value).toBe('[REDACTED]')
      }
    })

    it('should be case-insensitive for header names', () => {
      const result = sanitizeHeaders({
        Authorization: 'Bearer secret',
        COOKIE: 'session=abc',
      })

      expect(result['Authorization']).toBe('[REDACTED]')
      expect(result['COOKIE']).toBe('[REDACTED]')
    })

    it('should join array values', () => {
      const result = sanitizeHeaders({
        accept: ['text/html', 'application/json'],
      })

      expect(result['accept']).toBe('text/html, application/json')
    })

    it('should return empty object for undefined input', () => {
      const result = sanitizeHeaders(undefined)
      expect(result).toEqual({})
    })

    it('should skip null and undefined values', () => {
      const result = sanitizeHeaders({
        present: 'value',
        absent: undefined,
        empty: undefined,
      })

      expect(result['present']).toBe('value')
      expect('absent' in result).toBe(false)
      expect('empty' in result).toBe(false)
    })

    it('should stringify non-string values', () => {
      const result = sanitizeHeaders({
        'content-length': 42 as unknown,
        'x-flag': true as unknown,
      })

      expect(result['content-length']).toBe('42')
      expect(result['x-flag']).toBe('true')
    })

    it('should pass through non-sensitive headers unchanged', () => {
      const result = sanitizeHeaders({
        'content-type': 'application/json',
        'user-agent': 'my-sdk/1.0',
        'x-request-id': 'abc-123',
      })

      expect(result['content-type']).toBe('application/json')
      expect(result['user-agent']).toBe('my-sdk/1.0')
      expect(result['x-request-id']).toBe('abc-123')
    })
  })
})
