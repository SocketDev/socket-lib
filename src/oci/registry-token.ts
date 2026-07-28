/**
 * @file Anonymous bearer-token acquisition for an OCI distribution-spec pull.
 *   Two paths, unified behind `getRegistryToken`: probe `GET /v2/` for a
 *   `WWW-Authenticate` 401 challenge and honor its realm/service/scope (works
 *   for any spec-compliant registry, ghcr.io included), and fall back to the
 *   conventional `GET https://<registry>/token?service=<registry>&scope=
 *   repository:<repository>:pull` form when a registry answers the probe with
 *   a 200 advertising no challenge. A registry that needs no auth at all yields
 *   an empty token, which the manifest/blob callers send as no `Authorization`.
 */

import { ErrorCtor } from '../primordials/error'

import type {
  AuthChallenge,
  OciHttpOptions,
  OciHttpResponse,
  OciTokenResponse,
} from './types'

/**
 * Build the conventional anonymous pull-token URL for a registry that follows
 * the `service=<registry>` convention (ghcr.io, Docker Hub-style hosts).
 */
export function buildAnonymousTokenUrl(
  registry: string,
  repository: string,
): string {
  const params = new URLSearchParams()
  params.set('service', registry)
  params.set('scope', `repository:${repository}:pull`)
  return `https://${registry}/token?${params.toString()}`
}

/**
 * Build the token URL from a parsed challenge, forcing a pull scope for
 * `repository`. A challenge that already advertised a scope is overridden with
 * `repository:<repository>:pull` so the token is minted for the intended repo.
 */
export function buildChallengeTokenUrl(
  challenge: AuthChallenge,
  repository: string,
): string {
  const params = new URLSearchParams()
  if (challenge.service) {
    params.set('service', challenge.service)
  }
  params.set('scope', `repository:${repository}:pull`)
  return `${challenge.realm}?${params.toString()}`
}

/**
 * Read the first value of a possibly-array HTTP header.
 */
export function firstHeaderValue(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value
}

/**
 * Obtain an anonymous pull token for `repository` on `registry`. Probes
 * `GET /v2/`: a 401 with a parseable Bearer challenge drives the realm-based
 * token request; a 200 with no challenge means the registry serves anonymous
 * pulls directly, so the conventional `/token` endpoint is tried and an empty
 * token is returned when it declines. Fails loud when a registry demands auth
 * but advertises no usable challenge.
 */
export async function getRegistryToken(
  registry: string,
  repository: string,
  options: OciHttpOptions,
): Promise<string> {
  const opts = { __proto__: null, ...options } as OciHttpOptions
  const { http } = opts
  let probe: OciHttpResponse
  try {
    probe = await http.request(`https://${registry}/v2/`)
  } catch (e) {
    throw new ErrorCtor(
      `Cannot reach registry.\n` +
        `  Where: https://${registry}/v2/ for repository ${repository}\n` +
        `  Saw: request failed\n` +
        `  Fix: confirm the registry host is reachable and speaks OCI v2.`,
      { cause: e },
    )
  }
  let tokenUrl: string
  if (probe.status === 401) {
    const header = firstHeaderValue(probe.headers['www-authenticate'])
    const challenge = header ? parseWwwAuthenticate(header) : undefined
    if (!challenge) {
      throw new ErrorCtor(
        `Cannot authenticate to registry.\n` +
          `  Where: https://${registry}/v2/ for repository ${repository}\n` +
          `  Saw: 401 with no parseable Bearer WWW-Authenticate challenge\n` +
          `  Fix: confirm the registry speaks the OCI distribution token flow.`,
      )
    }
    tokenUrl = buildChallengeTokenUrl(challenge, repository)
  } else if (probe.ok) {
    // The registry answered the probe without a challenge — it either serves
    // fully anonymous pulls or still mints tokens at the conventional endpoint.
    tokenUrl = buildAnonymousTokenUrl(registry, repository)
  } else {
    throw new ErrorCtor(
      `Registry probe failed.\n` +
        `  Where: https://${registry}/v2/ for repository ${repository}\n` +
        `  Saw: HTTP ${probe.status} ${probe.statusText}\n` +
        `  Fix: confirm the registry host is correct and reachable.`,
    )
  }
  try {
    const data = await http.json<OciTokenResponse>(tokenUrl, {
      headers: { accept: 'application/json' },
    })
    return data.token ?? data.access_token ?? ''
  } catch {
    // A registry that serves anonymous pulls may 404 the conventional token
    // endpoint. Treat that as "no token needed" rather than a hard failure.
    if (probe.ok) {
      return ''
    }
    throw new ErrorCtor(
      `Token request failed.\n` +
        `  Where: ${tokenUrl}\n` +
        `  Saw: token endpoint did not return a bearer token\n` +
        `  Fix: confirm ${repository} is publicly pullable on ${registry}.`,
    )
  }
}

/**
 * Parse a `WWW-Authenticate: Bearer realm="...",service="...",scope="..."`
 * challenge into its realm/service/scope. Returns `undefined` for a non-Bearer
 * or realm-less header.
 */
export function parseWwwAuthenticate(
  header: string,
): AuthChallenge | undefined {
  const bearer = /^\s*Bearer\s+(.*)$/i.exec(header)
  if (!bearer) {
    return undefined
  }
  const params: Record<string, string> = Object.create(null)
  // Each challenge param is `key="value"`: capture 1 = the word-char key,
  // capture 2 = the quoted value, which is anything but a double quote.
  for (const match of bearer[1]!.matchAll(/(\w+)="([^"]*)"/g)) {
    params[match[1]!] = match[2]!
  }
  const { realm } = params
  if (!realm) {
    return undefined
  }
  return { realm, scope: params['scope'], service: params['service'] }
}
