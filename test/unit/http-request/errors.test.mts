import { describe, expect, test } from 'vitest'

import { enrichErrorMessage } from '../../../src/http-request/errors'

function makeErr(code: string): NodeJS.ErrnoException {
  const e = new Error(`fake ${code}`) as NodeJS.ErrnoException
  e.code = code
  return e
}

describe.sequential('http-request/errors — enrichErrorMessage', () => {
  test('always prefixes with method + URL', () => {
    const msg = enrichErrorMessage(
      'https://api.example.com',
      'GET',
      makeErr('UNKNOWN'),
    )
    expect(msg).toContain('GET request failed: https://api.example.com')
  })

  test('adds Connection-refused hint for ECONNREFUSED', () => {
    const msg = enrichErrorMessage('https://a', 'GET', makeErr('ECONNREFUSED'))
    expect(msg).toContain('Connection refused')
    expect(msg).toContain('firewall settings')
  })

  test('adds DNS hint for ENOTFOUND', () => {
    const msg = enrichErrorMessage('https://a', 'GET', makeErr('ENOTFOUND'))
    expect(msg).toContain('DNS lookup failed')
    expect(msg).toContain('Internet connection')
  })

  test('adds timeout hint for ETIMEDOUT', () => {
    const msg = enrichErrorMessage('https://a', 'GET', makeErr('ETIMEDOUT'))
    expect(msg).toContain('timed out')
  })

  test('adds reset hint for ECONNRESET', () => {
    const msg = enrichErrorMessage('https://a', 'POST', makeErr('ECONNRESET'))
    expect(msg).toContain('reset by server')
  })

  test('adds broken-pipe hint for EPIPE', () => {
    const msg = enrichErrorMessage('https://a', 'PUT', makeErr('EPIPE'))
    expect(msg).toContain('Broken pipe')
    expect(msg).toContain('Authentication credentials')
  })

  test('adds SSL hint for CERT_HAS_EXPIRED', () => {
    const msg = enrichErrorMessage(
      'https://a',
      'GET',
      makeErr('CERT_HAS_EXPIRED'),
    )
    expect(msg).toContain('SSL/TLS certificate error')
    expect(msg).toContain('System time')
  })

  test('adds SSL hint for UNABLE_TO_VERIFY_LEAF_SIGNATURE', () => {
    const msg = enrichErrorMessage(
      'https://a',
      'GET',
      makeErr('UNABLE_TO_VERIFY_LEAF_SIGNATURE'),
    )
    expect(msg).toContain('SSL/TLS certificate error')
  })

  test('falls back to "Error code: <code>" for unknown codes', () => {
    const msg = enrichErrorMessage('https://a', 'GET', makeErr('EHOSTUNREACH'))
    expect(msg).toContain('Error code: EHOSTUNREACH')
  })

  test('omits code-suffix line when code is undefined', () => {
    const e = new Error('no-code') as NodeJS.ErrnoException
    // No e.code set.
    const msg = enrichErrorMessage('https://a', 'GET', e)
    expect(msg).toBe('GET request failed: https://a')
    expect(msg).not.toContain('Error code:')
  })
})
