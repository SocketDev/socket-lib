/**
 * @file Unit tests for assertSafeHttpUrl() — the SSRF guard that parses an
 *   operator- or issuer-supplied URL, rejects non-HTTP(S) schemes, refuses
 *   loopback / private / link-local hosts, and requires https: for a public
 *   host. Set allowLocalhost to permit localhost over plaintext http: for
 *   local-stack development.
 */

import { assertSafeHttpUrl } from '../../src/url/assert-safe.mjs'
import { describe, expect, it } from 'vitest'

describe('assertSafeHttpUrl', () => {
  it('should return the parsed URL for a public https host', () => {
    const url = assertSafeHttpUrl('https://api.example.com/path')
    expect(url).toBeInstanceOf(URL)
    expect(url.href).toBe('https://api.example.com/path')
  })

  it('should accept https on a public host', () => {
    expect(assertSafeHttpUrl('https://example.com').protocol).toBe('https:')
    expect(assertSafeHttpUrl('https://example.com:8443/a?b=c').href).toBe(
      'https://example.com:8443/a?b=c',
    )
  })

  it('should refuse plaintext http on a public host', () => {
    expect(() => assertSafeHttpUrl('http://example.com')).toThrow(
      /must use https: for a public host/,
    )
    expect(() =>
      assertSafeHttpUrl('http://api.example.com/introspect'),
    ).toThrow(/must use https: for a public host/)
  })

  it('should name cleartext credentials as the reason http is refused', () => {
    expect(() =>
      assertSafeHttpUrl('http://api.example.com', { label: 'OAuth issuer' }),
    ).toThrow(
      /^OAuth issuer must use https: for a public host: http:\/\/api\.example\.com\. Got http:, which puts bearer tokens and client credentials on the wire in cleartext/,
    )
  })

  it('should refuse plaintext http on a public host even with allowLocalhost', () => {
    expect(() =>
      assertSafeHttpUrl('http://example.com', { allowLocalhost: true }),
    ).toThrow(/must use https: for a public host/)
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
    expect(() => assertSafeHttpUrl('http://[::1]:3000')).toThrow(
      /private\/loopback host/,
    )
    expect(() => assertSafeHttpUrl('https://localhost:3000')).toThrow(
      /private\/loopback host/,
    )
  })

  it('should refuse the cloud-metadata link-local address', () => {
    expect(() =>
      assertSafeHttpUrl('http://169.254.169.254/latest/meta-data'),
    ).toThrow(/private\/loopback host/)
  })

  it('should refuse private and link-local hosts over https too', () => {
    expect(() =>
      assertSafeHttpUrl('https://169.254.169.254/latest/meta-data'),
    ).toThrow(/private\/loopback host/)
    expect(() => assertSafeHttpUrl('https://10.0.0.5')).toThrow(
      /private\/loopback host/,
    )
    expect(() => assertSafeHttpUrl('https://192.168.1.1')).toThrow(
      /private\/loopback host/,
    )
  })

  it('should refuse RFC 1918 ranges', () => {
    expect(() => assertSafeHttpUrl('http://10.0.0.5')).toThrow(
      /private\/loopback host/,
    )
    expect(() => assertSafeHttpUrl('http://192.168.1.1')).toThrow(
      /private\/loopback host/,
    )
  })

  it('should permit plaintext http on loopback when allowLocalhost is set', () => {
    const url = assertSafeHttpUrl('http://localhost:3000', {
      allowLocalhost: true,
    })
    expect(url.hostname).toBe('localhost')
    expect(url.protocol).toBe('http:')
    expect(
      assertSafeHttpUrl('http://127.0.0.1', { allowLocalhost: true }).hostname,
    ).toBe('127.0.0.1')
    expect(
      assertSafeHttpUrl('http://[::1]:3000', { allowLocalhost: true }).hostname,
    ).toBe('[::1]')
  })

  it('should permit https on loopback when allowLocalhost is set', () => {
    expect(
      assertSafeHttpUrl('https://localhost:3000', { allowLocalhost: true })
        .protocol,
    ).toBe('https:')
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
