/**
 * @file SSRF guard for operator- or issuer-supplied URLs — `assertSafeHttpUrl`
 *   parses a raw URL, rejects non-HTTP(S) schemes, and refuses hosts that
 *   resolve to loopback / private / link-local ranges (cloud metadata, redis,
 *   internal services). A server that fetches a URL it did not author (an OAuth
 *   issuer, an introspection endpoint advertised in its metadata, a webhook
 *   target) runs the candidate through this before the request leaves the box.
 */

import { isLoopbackHost, isPrivateHost } from './predicates'

import type { AssertSafeHttpUrlOptions } from './types'

const UrlCtor = URL

/**
 * Parse `rawUrl` and assert it is safe to fetch server-side, returning the
 * parsed `URL`. Throws when the value does not parse, uses a scheme other than
 * `http:` / `https:`, or resolves to a loopback / private / link-local host.
 * Set `allowLocalhost` to permit `localhost` / `127.0.0.1` / `::1` for
 * local-stack development. `label` names the subject in the thrown message.
 *
 * @example
 *   ;```typescript
 *   assertSafeHttpUrl('https://api.example.com', { label: 'OAuth issuer' })
 *   // → URL { href: 'https://api.example.com/' }
 *
 *   assertSafeHttpUrl('http://169.254.169.254/latest/meta-data')
 *   // → throws: resolves to a private/loopback host
 *
 *   assertSafeHttpUrl('ftp://example.com')
 *   // → throws: must use http(s)
 *   ```
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
      `${label} must use http(s): ${rawUrl}. Got scheme "${url.protocol}"; use http: or https:.`,
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
  return url
}
