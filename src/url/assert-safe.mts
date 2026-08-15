/**
 * @file SSRF guard for operator- or issuer-supplied URLs — `assertSafeHttpUrl`
 *   parses a raw URL, rejects non-HTTP(S) schemes, refuses hosts that resolve
 *   to loopback / private / link-local ranges (cloud metadata, redis, internal
 *   services), and requires `https:` for every public host so credentials never
 *   cross the network in cleartext. A server that fetches a URL it did not
 *   author (an OAuth issuer, an introspection endpoint advertised in its
 *   metadata, a webhook target) runs the candidate through this before the
 *   request leaves the box. `allowLocalhost` is the one path that still accepts
 *   plaintext `http:`, and only for a loopback host.
 */

import { isLoopbackHost, isPrivateHost } from './predicates.mjs'

import type { AssertSafeHttpUrlOptions } from './types.mjs'

const UrlCtor = URL

/**
 * Parse `rawUrl` and assert it is safe to fetch server-side, returning the
 * parsed `URL`. Throws when the value does not parse, uses a scheme other than
 * `http:` / `https:`, resolves to a loopback / private / link-local host, or is
 * a public host reached over plaintext `http:`. A public host must be `https:`
 * because these URLs carry bearer tokens and client credentials, which `http:`
 * puts on the wire in cleartext for any network observer. Set `allowLocalhost`
 * to permit `localhost` / `127.0.0.1` / `::1` — over `http:` — for local-stack
 * development. `label` names the subject in the thrown message.
 *
 * @example
 *   ;```typescript
 *   assertSafeHttpUrl('https://api.example.com', { label: 'OAuth issuer' })
 *   // → URL { href: 'https://api.example.com/' }
 *
 *   assertSafeHttpUrl('http://api.example.com')
 *   // → throws: must use https: for a public host
 *
 *   assertSafeHttpUrl('http://localhost:3000', { allowLocalhost: true })
 *   // → URL { href: 'http://localhost:3000/' }
 *
 *   assertSafeHttpUrl('http://169.254.169.254/latest/meta-data')
 *   // → throws: resolves to a private/loopback host
 *
 *   assertSafeHttpUrl('ftp://example.com')
 *   // → throws: must use http(s)
 *   ```
 *
 * @security-disposition Published API — socket-cli's
 *   packages/cli/src/util/url/safe-endpoint.mts wraps this as its SSRF gate.
 */
export function assertSafeHttpUrl(
  rawUrl: string,
  options?: AssertSafeHttpUrlOptions | undefined,
): URL {
  const { allowLocalhost = false, label = 'URL' } = {
    __proto__: null,
    ...options,
  } as AssertSafeHttpUrlOptions
  let url: URL
  try {
    url = new UrlCtor(rawUrl)
  } catch {
    throw new Error(
      `${label} is not a valid URL: ${rawUrl}. Provide an absolute http(s) URL.`,
    )
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') {
    throw new Error(
      `${label} must use http(s): ${rawUrl}. Got scheme "${url.protocol}"; use https: (http: only for a loopback host with allowLocalhost).`,
    )
  }
  const { hostname } = url
  if (allowLocalhost && isLoopbackHost(hostname)) {
    return url
  }
  if (isPrivateHost(hostname)) {
    throw new Error(
      `${label} resolves to a private/loopback host and is refused: ${rawUrl}. Point it at a public host.`,
    )
  }
  if (url.protocol !== 'https:') {
    throw new Error(
      `${label} must use https: for a public host: ${rawUrl}. Got http:, which puts bearer tokens and client credentials on the wire in cleartext for any network observer to read; use https:, or set allowLocalhost and point it at a loopback host for local-stack development.`,
    )
  }
  return url
}
