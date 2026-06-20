/**
 * @file Tests for ai/billing-context — building a BillingContext with no
 *   privileged lookup. billingFromKeyed is pure (kind defaults + overrides +
 *   headroom passthrough); detectRoutingEnv reads the CI env; discover* probe
 *   credentials via a mocked resolver (no real keychain, no network).
 */

import { afterEach, describe, expect, it, vi } from 'vitest'

import { getEnvValue } from '../../../src/env/rewire'
import { resolveProviderCredential } from '../../../src/ai/credentials.mts'
import {
  billingFromKeyed,
  detectRoutingEnv,
  discoverBilling,
  discoverKeyedProviders,
} from '../../../src/ai/billing-context.mts'

import type { CredentialProvider } from '../../../src/ai/credentials.mts'

// Mock the env reader (for detectRoutingEnv) and the credential resolver (for
// the discover* probes) so tests never touch a real keychain, env, or network.
vi.mock(import('../../../src/env/rewire'), async importActual => ({
  ...(await importActual()),
  getEnvValue: vi.fn(),
}))
vi.mock(import('../../../src/ai/credentials.mts'), async importActual => ({
  ...(await importActual()),
  resolveProviderCredential: vi.fn(),
}))

const getEnvValueMock = vi.mocked(getEnvValue)
const resolveMock = vi.mocked(resolveProviderCredential)

afterEach(() => {
  vi.clearAllMocks()
})

describe('billingFromKeyed — default provider kinds', () => {
  it('tags every credential provider with a valid kind', () => {
    const all: CredentialProvider[] = [
      'anthropic',
      'fireworks',
      'openai',
      'synthetic',
      'xai',
    ]
    const ctx = billingFromKeyed({ keyed: new Set(all) })
    expect(Object.keys(ctx)).toHaveLength(all.length)
    for (let i = 0, { length } = all; i < length; i += 1) {
      expect(['flat-rate', 'metered', 'subscription']).toContain(
        ctx[all[i]!]?.kind,
      )
    }
  })

  it('encodes the provider billing nature (metered API, flat-rate, subscription seat)', () => {
    const ctx = billingFromKeyed({
      keyed: new Set<CredentialProvider>(['fireworks', 'openai', 'synthetic']),
    })
    expect(ctx.fireworks?.kind).toBe('metered')
    expect(ctx.synthetic?.kind).toBe('flat-rate')
    expect(ctx.openai?.kind).toBe('subscription')
  })
})

describe('billingFromKeyed', () => {
  it('tags each keyed provider with its default kind', () => {
    const ctx = billingFromKeyed({
      keyed: new Set<CredentialProvider>(['anthropic', 'synthetic']),
    })
    expect(ctx.anthropic).toStrictEqual({
      kind: 'metered',
      provider: 'anthropic',
    })
    expect(ctx.synthetic).toStrictEqual({
      kind: 'flat-rate',
      provider: 'synthetic',
    })
    expect(ctx.fireworks).toBeUndefined()
  })

  it('lets config override a provider kind (e.g. a Max-seat anthropic user)', () => {
    const ctx = billingFromKeyed({
      keyed: new Set<CredentialProvider>(['anthropic']),
      kinds: { anthropic: 'subscription' },
    })
    expect(ctx.anthropic?.kind).toBe('subscription')
  })

  it('passes through best-effort headroom when supplied', () => {
    const ctx = billingFromKeyed({
      headroom: { synthetic: { exhausted: false, fraction: 0.4 } },
      keyed: new Set<CredentialProvider>(['synthetic']),
    })
    expect(ctx.synthetic?.headroom).toStrictEqual({
      exhausted: false,
      fraction: 0.4,
    })
  })

  it('omits headroom by default (reactive)', () => {
    const ctx = billingFromKeyed({
      keyed: new Set<CredentialProvider>(['anthropic']),
    })
    expect(ctx.anthropic?.headroom).toBeUndefined()
  })

  it('returns an empty context for an empty keyed set', () => {
    expect(billingFromKeyed({ keyed: new Set() })).toStrictEqual({})
  })
})

describe('detectRoutingEnv', () => {
  it('returns "ci" when CI is set', () => {
    getEnvValueMock.mockReturnValue('1')
    expect(detectRoutingEnv()).toBe('ci')
  })

  it('returns "local" when CI is unset', () => {
    getEnvValueMock.mockReturnValue(undefined)
    expect(detectRoutingEnv()).toBe('local')
  })
})

describe('discoverKeyedProviders', () => {
  it('returns only the providers whose credential resolves', async () => {
    resolveMock.mockImplementation(async ({ provider }) =>
      provider === 'anthropic' || provider === 'fireworks' ? 'tok' : undefined,
    )
    const keyed = await discoverKeyedProviders({ allowEnvOnly: true })
    expect([...keyed].toSorted()).toStrictEqual(['anthropic', 'fireworks'])
  })

  it('returns an empty set when no credential resolves', async () => {
    resolveMock.mockResolvedValue(undefined)
    expect((await discoverKeyedProviders()).size).toBe(0)
  })
})

describe('discoverBilling', () => {
  it('discovers keyed providers and tags them with kinds', async () => {
    resolveMock.mockImplementation(async ({ provider }) =>
      provider === 'anthropic' || provider === 'synthetic' ? 'tok' : undefined,
    )
    const ctx = await discoverBilling({ env: 'local' })
    expect(ctx.anthropic?.kind).toBe('metered')
    expect(ctx.synthetic?.kind).toBe('flat-rate')
    expect(ctx.fireworks).toBeUndefined()
  })

  it('forces env-only credential probing in CI', async () => {
    resolveMock.mockResolvedValue(undefined)
    await discoverBilling({ env: 'ci' })
    for (const call of resolveMock.mock.calls) {
      expect(call[0].allowEnvOnly).toBe(true)
    }
  })
})
