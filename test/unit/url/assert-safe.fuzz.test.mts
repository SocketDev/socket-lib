/**
 * @file Property/fuzz tests for `url/assert-safe` (Tier-1 fleet property tests).
 *   `assertSafeHttpUrl` is an SSRF guard: it parses a raw URL, rejects
 *   non-HTTP(S) schemes, and refuses loopback / private / link-local hosts,
 *   returning the parsed `URL` when the value is judged safe. It signals every
 *   rejection by throwing a plain `Error` (never returns null). These tests
 *   feed arbitrary strings and constructed URLs and assert its invariants:
 *
 *   - it only ever throws its intended validation `Error`, never a stray
 *     `TypeError` or other exception (never-throws-unexpectedly);
 *   - anything it deems safe is a genuine, re-parseable `URL` with an http(s)
 *     scheme (round-trip);
 *   - it stays consistent with the `isPrivateHost` / `isLoopbackHost` predicates
 *     it delegates to (oracle).
 */

import fc from 'fast-check'
import { describe, expect, test } from 'vitest'

import { assertSafeHttpUrl } from '../../../src/url/assert-safe'
import { isLoopbackHost, isPrivateHost } from '../../../src/url/predicates'

// A subdomain label that cannot collide with any private-range prefix: it
// starts with a letter in a-e or g-z, so it never begins with the digit-,
// 'f'- (fc00/fd/fe80), or bracket-anchored alternatives of PRIVATE_HOST_REGEXP.
const publicSubdomainArb = fc.stringMatching(/^[a-eg-z][a-eg-z0-9]{0,10}$/u)

// Hostnames that are unambiguously public (never flagged by isPrivateHost).
const publicHostArb = fc.oneof(
  publicSubdomainArb.map(sub => `${sub}.example.com`),
  fc.constantFrom(
    '8.8.8.8',
    '1.1.1.1',
    '203.0.113.5',
    '198.51.100.7',
    '93.184.216.34',
    'example.com',
    'api.example.org',
  ),
)

const httpSchemeArb = fc.constantFrom('http', 'https')

// A safe, parseable http(s) URL string built around a guaranteed-public host,
// with optional port / path / query / fragment to exercise normalization.
const safeUrlArb = fc
  .record({
    scheme: httpSchemeArb,
    host: publicHostArb,
    port: fc.option(fc.integer({ min: 1, max: 65_535 }), { nil: undefined }),
    path: fc.stringMatching(/^(?:\/[a-z0-9\-._~]{0,12}){0,3}$/u),
    query: fc.option(fc.stringMatching(/^[a-z0-9]{1,8}=[a-z0-9]{1,8}$/u), {
      nil: undefined,
    }),
    fragment: fc.option(fc.stringMatching(/^[a-z0-9]{1,8}$/u), {
      nil: undefined,
    }),
  })
  .map(({ fragment, host, path, port, query, scheme }) => {
    const authority = port === undefined ? host : `${host}:${port}`
    const search = query === undefined ? '' : `?${query}`
    const hash = fragment === undefined ? '' : `#${fragment}`
    return `${scheme}://${authority}${path}${search}${hash}`
  })

// Parseable URLs whose scheme is deliberately not http(s).
const nonHttpUrlArb = fc.constantFrom(
  'ftp://example.com/x',
  'ws://example.com',
  'wss://example.com',
  'file:///tmp/a',
  'gopher://example.com',
  'data:text/plain,hello',
  'mailto:a@b.com',
  'blob:https://example.com/uuid',
  'chrome://settings',
  'about:blank',
)

// Bare private / loopback / link-local hostnames the guard must refuse. IPv6
// forms are bracketed, matching how `URL` reports them.
const privateHostArb = fc.constantFrom(
  '127.0.0.1',
  '10.0.0.1',
  '10.255.255.255',
  '192.168.0.1',
  '172.16.0.1',
  '172.31.255.254',
  '169.254.169.254',
  '0.0.0.0',
  'localhost',
  '[::1]',
  '[fe80::1]',
  '[fc00::1]',
  '[fd12:3456::1]',
)

// Strings that never parse as a URL — new URL(...) throws for each.
const unparseableArb = fc.constantFrom('', ' ', 'not a url', 'http://', ':::')

describe('url/assert-safe — assertSafeHttpUrl fuzz', () => {
  test('never throws unexpectedly: any string yields a URL or a plain Error', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          safeUrlArb,
          nonHttpUrlArb,
          privateHostArb.map(h => `http://${h}/`),
          fc.webUrl(),
        ),
        fc.boolean(),
        (raw, allowLocalhost) => {
          let result: URL | undefined
          try {
            result = assertSafeHttpUrl(raw, { allowLocalhost })
          } catch (e) {
            // The only sanctioned failure mode is a plain validation Error.
            expect(e).toBeInstanceOf(Error)
            expect((e as Error).message).toContain('URL')
            return
          }
          expect(result).toBeInstanceOf(URL)
        },
      ),
    )
  })

  test('safe public http(s) URLs are accepted and round-trip', () => {
    fc.assert(
      fc.property(safeUrlArb, fc.boolean(), (raw, allowLocalhost) => {
        const result = assertSafeHttpUrl(raw, { allowLocalhost })
        expect(result).toBeInstanceOf(URL)
        // Accepted scheme is always http(s).
        expect(['http:', 'https:']).toContain(result.protocol)
        // A URL it deems safe is genuinely re-parseable (round-trip idempotent).
        expect(new URL(result.href).href).toBe(result.href)
      }),
    )
  })

  test('oracle: an accepted URL is never a private host (unless allowLocalhost + loopback)', () => {
    fc.assert(
      fc.property(
        fc.oneof(
          fc.string(),
          safeUrlArb,
          nonHttpUrlArb,
          privateHostArb.map(h => `http://${h}/`),
          fc.webUrl(),
        ),
        fc.record({
          allowLocalhost: fc.boolean(),
          label: fc.option(fc.string(), { nil: undefined }),
        }),
        (raw, options) => {
          let result: URL | undefined
          try {
            result = assertSafeHttpUrl(raw, options)
          } catch {
            return
          }
          const { hostname, protocol } = result
          // Consistency with the delegated predicates: an accepted host is
          // either non-private, or a loopback host explicitly permitted.
          const accepted =
            !isPrivateHost(hostname) ||
            (options.allowLocalhost === true && isLoopbackHost(hostname))
          expect(accepted).toBe(true)
          expect(['http:', 'https:']).toContain(protocol)
        },
      ),
    )
  })

  test('restricted input: non-http(s) schemes are always rejected', () => {
    fc.assert(
      fc.property(nonHttpUrlArb, fc.boolean(), (raw, allowLocalhost) => {
        expect(() => assertSafeHttpUrl(raw, { allowLocalhost })).toThrow(Error)
      }),
    )
  })

  test('restricted input: private / loopback hosts are refused without allowLocalhost', () => {
    fc.assert(
      fc.property(privateHostArb, httpSchemeArb, (host, scheme) => {
        const raw = `${scheme}://${host}/`
        expect(() => assertSafeHttpUrl(raw, { allowLocalhost: false })).toThrow(
          Error,
        )
      }),
    )
  })

  test('allowLocalhost permits localhost / 127.0.0.1', () => {
    fc.assert(
      fc.property(
        fc.constantFrom('localhost', '127.0.0.1'),
        httpSchemeArb,
        (host, scheme) => {
          const result = assertSafeHttpUrl(`${scheme}://${host}/`, {
            allowLocalhost: true,
          })
          expect(result).toBeInstanceOf(URL)
          expect(isLoopbackHost(result.hostname)).toBe(true)
        },
      ),
    )
  })

  test('the label is echoed in every rejection message', () => {
    fc.assert(
      fc.property(unparseableArb, fc.string(), (raw, label) => {
        try {
          assertSafeHttpUrl(raw, { label })
          // Unparseable input must not be accepted.
          expect.unreachable('expected a thrown validation Error')
        } catch (e) {
          expect(e).toBeInstanceOf(Error)
          expect((e as Error).message).toContain(label)
        }
      }),
    )
  })

  // Documented contract (assert-safe.ts): "Set allowLocalhost to permit
  // localhost / 127.0.0.1 / ::1". URL brackets an IPv6 hostname (`[::1]`), so
  // isLoopbackHost now strips the brackets before matching — the fuzz caught
  // that this fast-path was previously dead for IPv6 loopback.
  test('allowLocalhost permits IPv6 loopback ::1 (documented)', () => {
    const result = assertSafeHttpUrl('http://[::1]/', { allowLocalhost: true })
    expect(result).toBeInstanceOf(URL)
  })
})
