/**
 * @file Unit tests for src/secrets/patterns.ts. Secret-shaped fixtures are
 *   constructed at runtime (prefix + repeat) so no literal token shape ever
 *   sits in the repo for a scanner to flag.
 */

import { describe, expect, it } from 'vitest'

import {
  ALL_TOKEN_KEY_PATTERNS,
  CHAT_TOKEN_PATTERNS,
  CI_TOKEN_PATTERNS,
  CLOUD_TOKEN_PATTERNS,
  EMAIL_TOKEN_PATTERNS,
  GENERIC_TOKEN_SUFFIX_RE,
  isTokenKey,
  LLM_TOKEN_PATTERNS,
  OBSERVABILITY_TOKEN_PATTERNS,
  PAYMENT_TOKEN_PATTERNS,
  PRODUCT_TOKEN_PATTERNS,
  REGISTRY_TOKEN_PATTERNS,
  scanSecretValues,
  SOCKET_FLEET_TOKEN_PATTERNS,
  VCS_TOKEN_PATTERNS,
} from '../../../src/secrets/patterns.mjs'

describe('ALL_TOKEN_KEY_PATTERNS', () => {
  it('is the flat union of the eleven category arrays', () => {
    const expected =
      SOCKET_FLEET_TOKEN_PATTERNS.length +
      LLM_TOKEN_PATTERNS.length +
      VCS_TOKEN_PATTERNS.length +
      PRODUCT_TOKEN_PATTERNS.length +
      CHAT_TOKEN_PATTERNS.length +
      CLOUD_TOKEN_PATTERNS.length +
      REGISTRY_TOKEN_PATTERNS.length +
      PAYMENT_TOKEN_PATTERNS.length +
      EMAIL_TOKEN_PATTERNS.length +
      OBSERVABILITY_TOKEN_PATTERNS.length +
      CI_TOKEN_PATTERNS.length
    expect(ALL_TOKEN_KEY_PATTERNS.length).toBe(expected)
  })
})

describe('isTokenKey', () => {
  it('matches names across categories', () => {
    expect(isTokenKey('SOCKET_API_TOKEN')).toBe(true)
    expect(isTokenKey('ANTHROPIC_API_KEY')).toBe(true)
    expect(isTokenKey('GH_TOKEN')).toBe(true)
    expect(isTokenKey('NPM_TOKEN')).toBe(true)
    expect(isTokenKey('SLACK_WEBHOOK_URL')).toBe(true)
    expect(isTokenKey('STRIPE_SECRET_KEY')).toBe(true)
  })

  it('rejects lookalike config keys', () => {
    expect(isTokenKey('FOO_API_VERSION')).toBe(false)
    expect(isTokenKey('TOKEN')).toBe(false)
    expect(isTokenKey('SOCKET_API_URL')).toBe(false)
  })

  it('matches whole names only, not substrings', () => {
    expect(isTokenKey('MY_GH_TOKEN_BACKUP')).toBe(false)
  })

  it('excludes the generic suffix fallback', () => {
    expect(isTokenKey('MYVENDOR_AUTH_TOKEN')).toBe(false)
    expect(GENERIC_TOKEN_SUFFIX_RE.test('MYVENDOR_AUTH_TOKEN')).toBe(true)
  })
})

describe('GENERIC_TOKEN_SUFFIX_RE', () => {
  it('requires a qualifier word before the suffix', () => {
    expect(GENERIC_TOKEN_SUFFIX_RE.test('KEY')).toBe(false)
    expect(GENERIC_TOKEN_SUFFIX_RE.test('TOKEN')).toBe(false)
    expect(GENERIC_TOKEN_SUFFIX_RE.test('MY_API_KEY')).toBe(true)
    expect(GENERIC_TOKEN_SUFFIX_RE.test('FOO_WEBHOOK_SECRET')).toBe(true)
  })

  it('spares JWT_PUBLIC_KEY but fires on JWT_PRIVATE_KEY', () => {
    expect(GENERIC_TOKEN_SUFFIX_RE.test('JWT_PUBLIC_KEY')).toBe(false)
    expect(GENERIC_TOKEN_SUFFIX_RE.test('JWT_PRIVATE_KEY')).toBe(true)
  })
})

describe('scanSecretValues', () => {
  it('detects a Socket API key shape', () => {
    const fake = `sktsec_${'a'.repeat(24)}`
    const hit = scanSecretValues(`export VALUE=${fake}`)
    expect(hit?.label).toBe('Socket API key (sktsec_)')
    expect(hit?.match).toBe(fake)
  })

  it('detects a GitHub personal access token shape', () => {
    const fake = `ghp_${'A'.repeat(36)}`
    const hit = scanSecretValues(`token: ${fake}`)
    expect(hit?.label).toBe('GitHub personal access token (ghp_)')
    expect(hit?.match).toBe(fake)
  })

  it('detects an AWS access key ID shape', () => {
    const fake = `AKIA${'0'.repeat(16)}`
    const hit = scanSecretValues(`aws_access_key_id = ${fake}`)
    expect(hit?.label).toBe('AWS access key ID (AKIA)')
    expect(hit?.match).toBe(fake)
  })

  it('detects an Anthropic key shape ahead of the generic sk- shape', () => {
    const fake = `sk-ant-${'b'.repeat(24)}`
    const hit = scanSecretValues(fake)
    expect(hit?.label).toBe('Anthropic API key (sk-ant-)')
  })

  it('detects a JWT shape', () => {
    const fake = `eyJ${'x'.repeat(12)}.${'y'.repeat(12)}.${'z'.repeat(12)}`
    expect(scanSecretValues(fake)?.label).toBe('JWT')
  })

  it('detects a PEM private-key header', () => {
    const header = ['-----BEGIN', 'RSA PRIVATE', 'KEY-----'].join(' ')
    expect(scanSecretValues(header)?.label).toBe('private key (PEM block)')
  })

  it('returns undefined for clean text', () => {
    expect(scanSecretValues('nothing to see here')).toBeUndefined()
    expect(scanSecretValues('sktsec_tooShort')).toBeUndefined()
    expect(scanSecretValues('')).toBeUndefined()
  })
})
