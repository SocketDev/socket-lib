/**
 * @file Unit tests for the pure OAuth PKCE helpers. The S256 relationship is
 *   re-derived with node:crypto rather than trusted; the discovery URL cases
 *   cover the RFC 8414 path-inserted form; the callback parser cases walk the
 *   RFC 8252 loopback shapes — success, provider error, state mismatch, and a
 *   code-less redirect.
 */

import crypto from 'node:crypto'

import { describe, expect, it } from 'vitest'

import {
  buildAuthorizationUrl,
  buildDiscoveryUrl,
  generatePkcePair,
  parseCallbackRequest,
} from '../../../src/secrets/oauth-pkce.mjs'

const BASE64URL_RE = /^[\w-]+$/

describe('generatePkcePair', () => {
  it('produces a base64url verifier of 32 random bytes (43 chars)', () => {
    const { verifier } = generatePkcePair()
    expect(verifier).toHaveLength(43)
    expect(verifier).toMatch(BASE64URL_RE)
  })

  it('derives the challenge as base64url(sha256(verifier)) — S256', () => {
    const { challenge, verifier } = generatePkcePair()
    const expected = crypto
      .createHash('sha256')
      .update(verifier)
      .digest('base64url')
    expect(challenge).toBe(expected)
    expect(challenge).toMatch(BASE64URL_RE)
  })

  it('produces a fresh pair per call', () => {
    const a = generatePkcePair()
    const b = generatePkcePair()
    expect(a.verifier).not.toBe(b.verifier)
    expect(a.challenge).not.toBe(b.challenge)
  })
})

describe('buildDiscoveryUrl', () => {
  it('builds the well-known URL for a root issuer', () => {
    expect(buildDiscoveryUrl('https://auth.example.test')).toBe(
      'https://auth.example.test/.well-known/oauth-authorization-server',
    )
  })

  it('inserts the well-known path BEFORE the issuer path (RFC 8414 §3)', () => {
    expect(buildDiscoveryUrl('https://auth.example.test/tenant-a')).toBe(
      'https://auth.example.test/.well-known/oauth-authorization-server/tenant-a',
    )
  })

  it('strips a trailing slash from the issuer path', () => {
    expect(buildDiscoveryUrl('https://auth.example.test/tenant-a/')).toBe(
      'https://auth.example.test/.well-known/oauth-authorization-server/tenant-a',
    )
  })

  it('treats a bare trailing slash as the root form', () => {
    expect(buildDiscoveryUrl('https://auth.example.test/')).toBe(
      'https://auth.example.test/.well-known/oauth-authorization-server',
    )
  })
})

describe('buildAuthorizationUrl', () => {
  const config = {
    authorizationEndpoint: 'https://auth.example.test/authorize',
    challenge: 'the-challenge',
    clientId: 'cli-client',
    redirectUri: 'http://127.0.0.1:49152/callback',
    scopes: ['full-scans', 'report'],
    state: 'the-state',
  }

  it('carries every parameter of the code + PKCE request', () => {
    const url = new URL(buildAuthorizationUrl(config))
    expect(url.origin + url.pathname).toBe(
      'https://auth.example.test/authorize',
    )
    expect(url.searchParams.get('client_id')).toBe('cli-client')
    expect(url.searchParams.get('code_challenge')).toBe('the-challenge')
    expect(url.searchParams.get('code_challenge_method')).toBe('S256')
    expect(url.searchParams.get('redirect_uri')).toBe(
      'http://127.0.0.1:49152/callback',
    )
    expect(url.searchParams.get('response_type')).toBe('code')
    expect(url.searchParams.get('state')).toBe('the-state')
  })

  it('space-joins the scopes', () => {
    const url = new URL(buildAuthorizationUrl(config))
    expect(url.searchParams.get('scope')).toBe('full-scans report')
  })

  it('preserves query params already on the authorization endpoint', () => {
    const url = new URL(
      buildAuthorizationUrl({
        ...config,
        authorizationEndpoint: 'https://auth.example.test/authorize?audience=x',
      }),
    )
    expect(url.searchParams.get('audience')).toBe('x')
    expect(url.searchParams.get('client_id')).toBe('cli-client')
  })
})

describe('parseCallbackRequest', () => {
  it('returns the code when state matches (RFC 8252 loopback success)', () => {
    expect(
      parseCallbackRequest('/callback?code=auth-code&state=s1', 's1'),
    ).toEqual({ code: 'auth-code' })
  })

  it('parses a relative request-target the loopback listener receives', () => {
    // node:http hands the handler `req.url` as a path, never an absolute URL;
    // the parser must resolve it against a loopback base.
    expect(parseCallbackRequest('/callback?code=c&state=s', 's')).toEqual({
      code: 'c',
    })
  })

  it('returns the provider error with its description when present', () => {
    expect(
      parseCallbackRequest(
        '/callback?error=access_denied&error_description=user+said+no',
        's1',
      ),
    ).toEqual({ error: 'access_denied: user said no' })
  })

  it('returns the bare provider error when no description came back', () => {
    expect(parseCallbackRequest('/callback?error=server_error', 's1')).toEqual({
      error: 'server_error',
    })
  })

  it('rejects a state mismatch even when a code is present', () => {
    const parsed = parseCallbackRequest(
      '/callback?code=stolen&state=other',
      's1',
    )
    expect(parsed).toEqual({
      error: 'state mismatch — callback not initiated by this run',
    })
  })

  it('rejects a matching-state callback that carries no code', () => {
    expect(parseCallbackRequest('/callback?state=s1', 's1')).toEqual({
      error: 'callback carried no authorization code',
    })
  })

  it('provider error wins over a state mismatch', () => {
    expect(
      parseCallbackRequest('/callback?error=access_denied&state=other', 's1'),
    ).toEqual({ error: 'access_denied' })
  })
})
