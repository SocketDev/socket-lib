import { describe, expect, it } from 'vitest'

import {
  isSocketOAuthCredentialRecord,
  normalizeSocketOAuthOptions,
  parseCredentialRecord,
  socketOAuthAccount,
  validateSocketOAuthIssuer,
  validateSocketOAuthTokens,
} from '../../../src/secrets/socket-oauth.mjs'

import type { OAuthCredentialRecord } from '../../../src/secrets/socket-oauth.mjs'

const options = {
  clientId: 'socket-cli',
  issuer: 'https://api.socket.dev/v1/oauth2/',
}

const record: OAuthCredentialRecord = {
  accessToken: 'fixture-access-token',
  clientId: options.clientId,
  expiresAt: 1_800_000_000_000,
  issuer: options.issuer,
  refreshToken: 'fixture-refresh-token',
  version: 1,
}

describe('validateSocketOAuthIssuer', () => {
  it('normalizes the issuer path with a trailing slash', () => {
    expect(validateSocketOAuthIssuer('https://auth.example.test/oauth')).toBe(
      'https://auth.example.test/oauth/',
    )
  })

  it('allows local HTTP issuers for development', () => {
    expect(validateSocketOAuthIssuer('http://localhost:4567/oauth')).toBe(
      'http://localhost:4567/oauth/',
    )
  })

  it.each([
    'http://auth.example.test/oauth',
    'https://user:password@auth.example.test/oauth',
    'https://auth.example.test/oauth?debug=1',
    'https://auth.example.test/oauth#fragment',
  ])('rejects unsafe issuer %s', issuer => {
    expect(() => validateSocketOAuthIssuer(issuer)).toThrow(TypeError)
  })
})

describe('Socket OAuth credential binding', () => {
  it('normalizes public client options', () => {
    expect(normalizeSocketOAuthOptions(options)).toEqual(options)
  })

  it('uses a distinct keychain account for each issuer and client', () => {
    const account = socketOAuthAccount(options)
    const otherClientAccount = socketOAuthAccount({
      ...options,
      clientId: 'socket-mcp',
    })
    const otherIssuerAccount = socketOAuthAccount({
      ...options,
      issuer: 'https://staging.example.test',
    })
    expect(account).not.toBe(otherClientAccount)
    expect(account).not.toBe(otherIssuerAccount)
  })

  it('accepts only versioned credentials bound to the requested client', () => {
    expect(isSocketOAuthCredentialRecord(record, options)).toBe(true)
    expect(
      isSocketOAuthCredentialRecord(record, {
        ...options,
        clientId: 'socket-mcp',
      }),
    ).toBe(false)
    expect(parseCredentialRecord(JSON.stringify(record), options)).toEqual(
      record,
    )
    expect(() => parseCredentialRecord('{invalid', options)).toThrow(TypeError)
  })
})

describe('validateSocketOAuthTokens', () => {
  it('requires a bearer token, positive lifetime, and refresh token at login', () => {
    expect(() =>
      validateSocketOAuthTokens(
        {
          accessToken: 'fixture-access-token',
          expiresIn: 3600,
          refreshToken: 'fixture-refresh-token',
          tokenType: 'Bearer',
        },
        { requireRefreshToken: true },
      ),
    ).not.toThrow()
    expect(() =>
      validateSocketOAuthTokens(
        {
          accessToken: 'fixture-access-token',
          expiresIn: 3600,
          tokenType: 'Basic',
        },
        { requireRefreshToken: true },
      ),
    ).toThrow(TypeError)
  })
})
