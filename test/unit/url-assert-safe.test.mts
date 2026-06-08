/**
 * @file Unit tests for assertSafeHttpUrl() — the SSRF guard that parses an
 *   operator- or issuer-supplied URL, rejects non-HTTP(S) schemes, and refuses
 *   loopback / private / link-local hosts. Set allowLocalhost to permit
 *   localhost for local-stack development.
 */

import { assertSafeHttpUrl } from '../../src/url/assert-safe'
import { describe, expect, it } from 'vitest'

describe('assertSafeHttpUrl', () => {
  it('should return the parsed URL for a public https host', () => {
    const url = assertSafeHttpUrl('https://api.example.com/path')
    expect(url).toBeInstanceOf(URL)
    expect(url.href).toBe('https://api.example.com/path')
  })

  it('should accept http as well as https', () => {
    expect(assertSafeHttpUrl('http://example.com').protocol).toBe('http:')
    expect(assertSafeHttpUrl('https://example.com').protocol).toBe('https:')
  })

  it('should throw for a value that does not parse', () => {
    expect(() => assertSafeHttpUrl('not a url')).toThrow(/not a valid URL/)
  })

  it('should throw for non-http(s) schemes', () => {
    expect(() => assertSafeHttpUrl('ftp://example.com')).toThrow(
      /must use http\(s\)/,
    )
    expect(() => assertSafeHttpUrl('file:///etc/passwd')).toThrow(
      /must use http\(s\)/,
    )
  })

  it('should refuse loopback hosts by default', () => {
    expect(() => assertSafeHttpUrl('http://localhost:3000')).toThrow(
      /private\/loopback host/,
    )
    expect(() => assertSafeHttpUrl('http://127.0.0.1')).toThrow(
      /private\/loopback host/,
    )
  })

  it('should refuse the cloud-metadata link-local address', () => {
    expect(() =>
      assertSafeHttpUrl('http://169.254.169.254/latest/meta-data'),
    ).toThrow(/private\/loopback host/)
  })

  it('should refuse RFC 1918 ranges', () => {
    expect(() => assertSafeHttpUrl('http://10.0.0.5')).toThrow(
      /private\/loopback host/,
    )
    expect(() => assertSafeHttpUrl('http://192.168.1.1')).toThrow(
      /private\/loopback host/,
    )
  })

  it('should permit localhost only when allowLocalhost is set', () => {
    const url = assertSafeHttpUrl('http://localhost:3000', {
      allowLocalhost: true,
    })
    expect(url.hostname).toBe('localhost')
    expect(
      assertSafeHttpUrl('http://127.0.0.1', { allowLocalhost: true }).hostname,
    ).toBe('127.0.0.1')
  })

  it('should still refuse non-loopback private hosts even with allowLocalhost', () => {
    expect(() =>
      assertSafeHttpUrl('http://10.0.0.5', { allowLocalhost: true }),
    ).toThrow(/private\/loopback host/)
  })

  it('should use the provided label in thrown messages', () => {
    expect(() =>
      assertSafeHttpUrl('ftp://example.com', { label: 'OAuth issuer' }),
    ).toThrow(/^OAuth issuer must use http\(s\)/)
    expect(() =>
      assertSafeHttpUrl('not a url', { label: 'OAuth issuer' }),
    ).toThrow(/^OAuth issuer is not a valid URL/)
  })

  it('should default the label to "URL"', () => {
    expect(() => assertSafeHttpUrl('ftp://example.com')).toThrow(
      /^URL must use/,
    )
  })
})
