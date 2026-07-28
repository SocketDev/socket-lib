/**
 * @file URL type-guard predicates — `isUrl` answers whether a value parses as a
 *   valid URL via `parseUrl`. `isLoopbackHost` / `isPrivateHost` classify a
 *   hostname for SSRF guards: a server that fetches an operator- or
 *   issuer-supplied URL uses these to refuse hosts that resolve to the local
 *   machine or an internal network (cloud metadata, redis, link-local).
 */

import { RegExpPrototypeTest } from '../primordials/regexp'
import {
  StringPrototypeEndsWith,
  StringPrototypeSlice,
  StringPrototypeStartsWith,
  StringPrototypeToLowerCase,
} from '../primordials/string'

import { parseUrl } from './parse'

// Loopback / link-local / private IPv4 ranges plus IPv6 loopback and ULA
// (fc00::/7) and link-local (fe80::/10) that an SSRF probe would target.
// Bracketed forms cover the way `URL` reports IPv6 hostnames. Matched against
// a lowercased hostname.
const PRIVATE_HOST_REGEXP =
  /^(?:0\.0\.0\.0$|10\.|127\.|169\.254\.|172\.(?:1[6-9]|2\d|3[01])\.|192\.168\.|\[?::1\]?$|\[?fc00:|\[?fd|\[?fe80:)/u

/**
 * Check whether a hostname is a loopback address — `localhost`, `127.0.0.1`, or
 * IPv6 `::1`. Compares case-insensitively; pass a bare hostname, not a URL.
 *
 * @example
 *   ;```typescript
 *   isLoopbackHost('localhost') // true
 *   isLoopbackHost('127.0.0.1') // true
 *   isLoopbackHost('example.com') // false
 *   ```
 */
export function isLoopbackHost(hostname: string): boolean {
  let host = StringPrototypeToLowerCase(hostname)
  // `URL` reports an IPv6 hostname bracketed (e.g. `[::1]`); compare the bare
  // form so `allowLocalhost` can permit IPv6 loopback, matching `isPrivateHost`
  // (whose regex already tolerates the brackets).
  if (
    StringPrototypeStartsWith(host, '[') &&
    StringPrototypeEndsWith(host, ']')
  ) {
    host = StringPrototypeSlice(host, 1, -1)
  }
  return host === '::1' || host === '127.0.0.1' || host === 'localhost'
}

/**
 * Check whether a hostname resolves to a private / loopback / link-local
 * address an SSRF probe would target (the local machine, RFC 1918 ranges, IPv6
 * loopback / ULA / link-local). Loopback hosts count as private. Compares
 * case-insensitively; pass a bare hostname, not a URL.
 *
 * @example
 *   ;```typescript
 *   isPrivateHost('127.0.0.1') // true
 *   isPrivateHost('10.0.0.5') // true
 *   isPrivateHost('169.254.169.254') // true
 *   isPrivateHost('example.com') // false
 *   ```
 */
export function isPrivateHost(hostname: string): boolean {
  const host = StringPrototypeToLowerCase(hostname)
  return isLoopbackHost(host) || RegExpPrototypeTest(PRIVATE_HOST_REGEXP, host)
}

/**
 * Check if a value is a valid URL.
 *
 * @example
 *   ;```typescript
 *   isUrl('https://example.com') // true
 *   isUrl('not a url') // false
 *   isUrl(null) // false
 *   ```
 */
export function isUrl(value: string | URL | null | undefined): boolean {
  return (
    ((typeof value === 'string' && value !== '') ||
      (value !== null && typeof value === 'object')) &&
    !!parseUrl(value)
  )
}
