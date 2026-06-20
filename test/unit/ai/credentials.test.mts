/**
 * @file Tests for ai/credentials — the layered provider-credential resolver
 *   (explicit → env → keychain) shared by the AI backends.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { resolve } from '../../../src/secrets/find'
import {
  deleteSecret,
  getBackendAvailability,
  writeSecret,
} from '../../../src/secrets/keychain'
import {
  deleteProviderCredential,
  isCredentialProvider,
  PROVIDER_CREDENTIALS,
  resolveProviderCredential,
  writeProviderCredential,
} from '../../../src/ai/credentials.mts'

// Mock the env resolver plus the keychain write + erase helpers, so the suite
// never touches a real keychain. The vi.mock calls are hoisted above the
// imports, so the static imports resolve to the mocks.
vi.mock(import('../../../src/secrets/find'), () => ({
  resolve: vi.fn(),
}))
vi.mock(import('../../../src/secrets/keychain'), () => ({
  deleteSecret: vi.fn(),
  getBackendAvailability: vi.fn(),
  writeSecret: vi.fn(),
}))

const resolveMock = vi.mocked(resolve)
const writeMock = vi.mocked(writeSecret)
const deleteMock = vi.mocked(deleteSecret)
const backendMock = vi.mocked(getBackendAvailability)

beforeEach(() => {
  // Default: a keychain backend is available; the unavailable case overrides.
  backendMock.mockReturnValue({
    available: true,
    installHint: undefined,
    toolName: 'security(1)',
  })
})

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

describe('writeProviderCredential', () => {
  it('persists to the SAME keychain slot the resolver reads', async () => {
    writeMock.mockResolvedValue('written')
    const outcome = await writeProviderCredential({
      provider: 'fireworks',
      value: 'sk-new',
    })
    expect(outcome).toBe('written')
    expect(writeMock).toHaveBeenCalledWith({
      account: 'FIREWORKS_API_KEY',
      service: 'socketsecurity',
      value: 'sk-new',
    })
  })

  it('writes anthropic to the keychain slot (never an rc export)', async () => {
    writeMock.mockResolvedValue('written')
    await writeProviderCredential({ provider: 'anthropic', value: 'sk-ant' })
    expect(writeMock).toHaveBeenCalledWith({
      account: 'ANTHROPIC_API_KEY',
      service: 'socketsecurity',
      value: 'sk-ant',
    })
  })

  it('throws (without writing) when no keychain backend is available', async () => {
    backendMock.mockReturnValue({
      available: false,
      installHint: 'apt install libsecret-tools',
      toolName: 'secret-tool',
    })
    await expect(
      writeProviderCredential({ provider: 'fireworks', value: 'x' }),
    ).rejects.toThrow(/secret-tool/)
    expect(writeMock).not.toHaveBeenCalled()
  })
})

describe('deleteProviderCredential', () => {
  it('targets the matching keychain slot and reports removal', async () => {
    deleteMock.mockResolvedValue('removed')
    const outcome = await deleteProviderCredential({ provider: 'synthetic' })
    expect(outcome).toBe('removed')
    expect(deleteMock).toHaveBeenCalledWith({
      account: 'SYNTHETIC_API_KEY',
      service: 'socketsecurity',
    })
  })

  it('reports absent when no credential was stored', async () => {
    deleteMock.mockResolvedValue('absent')
    expect(await deleteProviderCredential({ provider: 'openai' })).toBe(
      'absent',
    )
  })
})
