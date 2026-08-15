/**
 * @file Pure seams for a client-side OAuth authorization-code flow: PKCE
 *   S256 pair generation (RFC 7636 §4), the RFC 8414 issuer-discovery URL,
 *   the authorization URL the browser opens, and the loopback callback
 *   parser (RFC 8252). Every function here is network-free so the whole
 *   protocol surface is unit-testable; the flow driver — listener, browser
 *   open, token exchange — lives with the caller.
 *   `./login`'s `loginWithSocketOauth()` adopts these seams in v7; until
 *   then it carries its own inline copies and both stand.
 */

import crypto from 'node:crypto'

export interface AuthorizationUrlConfig {
  authorizationEndpoint: string
  challenge: string
  clientId: string
  redirectUri: string
  scopes: readonly string[]
  state: string
}

/**
 * The full authorization URL the browser opens: the authorization endpoint
 * with the PKCE challenge (S256), client id, redirect URI, requested scopes,
 * and the `state` value that later binds the loopback callback to this run.
 */
export function buildAuthorizationUrl(config: AuthorizationUrlConfig): string {
  const cfg = { __proto__: null, ...config } as AuthorizationUrlConfig
  const url = new URL(cfg.authorizationEndpoint)
  url.searchParams.set('client_id', cfg.clientId)
  url.searchParams.set('code_challenge', cfg.challenge)
  url.searchParams.set('code_challenge_method', 'S256')
  url.searchParams.set('redirect_uri', cfg.redirectUri)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('scope', cfg.scopes.join(' '))
  url.searchParams.set('state', cfg.state)
  return url.href
}

/**
 * The RFC 8414 well-known URL for an issuer, honoring a path component
 * (path-inserted form —
 * `https://host/.well-known/oauth-authorization-server/<path>` — the probe
 * order RFC 8414 §3 specifies for issuers with a path).
 */
export function buildDiscoveryUrl(issuer: string): string {
  const url = new URL(issuer)
  const path = url.pathname.replace(/\/$/, '')
  return `${url.origin}/.well-known/oauth-authorization-server${path}`
}

export interface PkcePair {
  challenge: string
  verifier: string
}

/**
 * A fresh PKCE verifier/challenge pair (S256, RFC 7636 §4). The verifier is
 * 32 random bytes base64url-encoded; the challenge is the base64url SHA-256
 * of the verifier, which binds the authorization code to this process.
 */
export function generatePkcePair(): PkcePair {
  const verifier = crypto.randomBytes(32).toString('base64url')
  const challenge = crypto
    .createHash('sha256')
    .update(verifier)
    .digest('base64url')
  return { challenge, verifier }
}

/**
 * Parse the RFC 8252 loopback callback request: the authorization code when
 * `state` matches, or an error describing what came back instead. A state
 * mismatch is an error, not a retry — a callback this run did not initiate
 * must never yield a code.
 */
export function parseCallbackRequest(
  requestUrl: string,
  expectedState: string,
): { code: string } | { error: string } {
  const url = new URL(requestUrl, 'http://127.0.0.1')
  const err = url.searchParams.get('error')
  if (err) {
    const description = url.searchParams.get('error_description')
    return { error: description ? `${err}: ${description}` : err }
  }
  if (url.searchParams.get('state') !== expectedState) {
    return { error: 'state mismatch — callback not initiated by this run' }
  }
  const code = url.searchParams.get('code')
  if (!code) {
    return { error: 'callback carried no authorization code' }
  }
  return { code }
}
