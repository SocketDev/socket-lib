/**
 * @file Tests for ai/credentials — the layered provider-credential resolver
 *   (explicit → env → keychain) shared by the AI backends.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { resolve } from '../../../src/secrets/find'
import {
  isCredentialProvider,
  PROVIDER_CREDENTIALS,
  resolveProviderCredential,
} from '../../../src/ai/credentials.mts'

// Mock the keychain/env resolver so tests never touch a real keychain. The
// vi.mock call is hoisted above the imports, so the static `resolve` import
// resolves to the mock.
vi.mock(import('../../../src/secrets/find'), () => ({
  resolve: vi.fn(),
}))

const resolveMock = vi.mocked(resolve)

afterEach(() => {
  vi.clearAllMocks()
})

describe('PROVIDER_CREDENTIALS', () => {
  it('maps every provider to an env var + keychain service', () => {
    for (const spec of Object.values(PROVIDER_CREDENTIALS)) {
      expect(spec.tokenEnv).toMatch(/_API_KEY$/)
      expect(spec.keychainService).toBe('socketsecurity')
    }
  })

  it('pins the fireworks + synthetic env vars to match ai/http.mts', () => {
    expect(PROVIDER_CREDENTIALS.fireworks.tokenEnv).toBe('FIREWORKS_API_KEY')
    expect(PROVIDER_CREDENTIALS.synthetic.tokenEnv).toBe('SYNTHETIC_API_KEY')
  })
})

describe('isCredentialProvider', () => {
  it('accepts known providers, rejects others', () => {
    expect(isCredentialProvider('fireworks')).toBe(true)
    expect(isCredentialProvider('anthropic')).toBe(true)
    expect(isCredentialProvider('gemini')).toBe(false)
    expect(isCredentialProvider('')).toBe(false)
  })
})

describe('resolveProviderCredential', () => {
  it('returns the explicit token without touching the resolver', async () => {
    const token = await resolveProviderCredential({
      explicit: 'sk-explicit',
      provider: 'fireworks',
    })
    expect(token).toBe('sk-explicit')
    expect(resolveMock).not.toHaveBeenCalled()
  })

  it('resolves via env/keychain when no explicit token', async () => {
    resolveMock.mockResolvedValue({
      account: 'XAI_API_KEY',
      source: 'env',
      value: 'sk-resolved',
    })
    const token = await resolveProviderCredential({ provider: 'xai' })
    expect(token).toBe('sk-resolved')
    expect(resolveMock).toHaveBeenCalledWith({
      accounts: ['XAI_API_KEY'],
      allowEnvOnly: undefined,
      service: 'socketsecurity',
    })
  })

  it('forwards allowEnvOnly for headless contexts', async () => {
    resolveMock.mockResolvedValue(undefined)
    await resolveProviderCredential({
      allowEnvOnly: true,
      provider: 'anthropic',
    })
    expect(resolveMock).toHaveBeenCalledWith({
      accounts: ['ANTHROPIC_API_KEY'],
      allowEnvOnly: true,
      service: 'socketsecurity',
    })
  })

  it('returns undefined when nothing has the token', async () => {
    resolveMock.mockResolvedValue(undefined)
    const token = await resolveProviderCredential({ provider: 'openai' })
    expect(token).toBeUndefined()
  })
})
