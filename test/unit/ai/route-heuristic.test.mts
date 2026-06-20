/**
 * @file Tests for ai/route-heuristic — the pure billing-aware reorder over
 *   route.mts. Commodity tiers chase the cheapest equivalent in local dev;
 *   high-value tiers and CI stay quality-first; budget pressure demotes;
 *   allocateBudget splits a total by members + weights. The fixtures mirror the
 *   real billing shapes (metered org, free subscription seat, flat-rate plan,
 *   shared pool, no creds) the harness must handle generically.
 */

import { describe, expect, it } from 'vitest'

import {
  allocateBudget,
  candidateScore,
  orderCandidates,
  taskClassToTier,
} from '../../../src/ai/route-heuristic.mts'

import type { CredentialProvider } from '../../../src/ai/credentials.mts'
import type {
  BillingAccount,
  BillingContext,
} from '../../../src/ai/route-heuristic.mts'
import type { RouteContext } from '../../../src/ai/route.mts'
import type { AiAgentName } from '../../../src/ai/types.mts'

function ctx(
  available: readonly AiAgentName[],
  keyed: readonly CredentialProvider[],
): RouteContext {
  return { available: new Set(available), keyed: new Set(keyed) }
}

// Every engine + every provider usable, so a tier's full chain survives the
// availability gate and only the billing policy reorders it.
const ALL_ENGINES: readonly AiAgentName[] = [
  'claude',
  'codex',
  'gemini',
  'opencode',
]
const ALL_PROVIDERS: readonly CredentialProvider[] = [
  'anthropic',
  'fireworks',
  'openai',
  'synthetic',
  'xai',
]
const FULL: RouteContext = ctx(ALL_ENGINES, ALL_PROVIDERS)

function bill(
  entries: Readonly<Partial<Record<CredentialProvider, BillingAccount>>>,
): BillingContext {
  return entries
}

function providers(candidates: ReadonlyArray<{ provider: string }>): string[] {
  return candidates.map(c => c.provider)
}

describe('taskClassToTier', () => {
  it('maps each class to its capability tier', () => {
    expect(taskClassToTier('grunt')).toBe('haiku')
    expect(taskClassToTier('code')).toBe('sonnet')
    expect(taskClassToTier('agentic')).toBe('opus')
    expect(taskClassToTier('plan')).toBe('opus')
  })

  it('defaults an unknown label to sonnet', () => {
    expect(taskClassToTier('nonsense' as never)).toBe('sonnet')
  })
})

describe('billing-kind cost ranking', () => {
  it('ranks flat-rate cheapest, then subscription, then metered (via candidateScore)', () => {
    const score = (kind: BillingAccount['kind']): number =>
      candidateScore({
        account: { kind, provider: 'anthropic' },
        demoteThreshold: 0.2,
        promoteCheap: true,
      })
    expect(score('flat-rate')).toBeLessThan(score('subscription'))
    expect(score('subscription')).toBeLessThan(score('metered'))
  })
})

describe('candidateScore', () => {
  const base = { demoteThreshold: 0.2, promoteCheap: true } as const

  it('scores a candidate with no billing account neutral', () => {
    expect(candidateScore({ ...base, account: undefined })).toBe(0)
  })

  it('sinks an exhausted account far behind a near-cap one', () => {
    const exhausted = candidateScore({
      ...base,
      account: {
        headroom: { exhausted: true, fraction: undefined },
        kind: 'metered',
        provider: 'anthropic',
      },
    })
    const nearCap = candidateScore({
      ...base,
      account: {
        headroom: { exhausted: false, fraction: 0.1 },
        kind: 'metered',
        provider: 'anthropic',
      },
    })
    expect(exhausted).toBeGreaterThan(nearCap)
    expect(nearCap).toBeGreaterThan(0)
  })

  it('applies a cost penalty only when promoteCheap is set', () => {
    const account: BillingAccount = {
      kind: 'metered',
      provider: 'anthropic',
    }
    expect(candidateScore({ ...base, account, promoteCheap: false })).toBe(0)
    expect(
      candidateScore({ ...base, account, promoteCheap: true }),
    ).toBeGreaterThan(0)
  })

  it('pulls a preferred provider earlier (lower score)', () => {
    const account: BillingAccount = { kind: 'metered', provider: 'openai' }
    const withPrefer = candidateScore({
      ...base,
      account: { ...account, prefer: 5 },
    })
    const without = candidateScore({ ...base, account })
    expect(withPrefer).toBeLessThan(without)
  })
})

describe('orderCandidates', () => {
  it('promotes the cheapest billing kind ahead of the Claude head on a commodity tier in local dev', () => {
    // sonnet chain: claude(anthropic) → codex(openai) → opencode(synthetic).
    const order = orderCandidates({
      billing: bill({
        anthropic: { kind: 'metered', provider: 'anthropic' },
        openai: { kind: 'subscription', provider: 'openai' },
        synthetic: { kind: 'flat-rate', provider: 'synthetic' },
      }),
      env: 'local',
      route: FULL,
      tier: 'sonnet',
    })
    // flat-rate < subscription < metered.
    expect(providers(order)).toStrictEqual(['synthetic', 'openai', 'anthropic'])
  })

  it('keeps the Claude head first on a high-value tier even when a cheaper equivalent exists', () => {
    // opus chain: claude(anthropic) → codex(openai) → opencode(fireworks).
    const order = orderCandidates({
      billing: bill({
        anthropic: { kind: 'metered', provider: 'anthropic' },
        fireworks: { kind: 'metered', provider: 'fireworks' },
        openai: { kind: 'subscription', provider: 'openai' },
      }),
      env: 'local',
      route: FULL,
      tier: 'opus',
    })
    expect(providers(order)).toStrictEqual(['anthropic', 'openai', 'fireworks'])
  })

  it('keeps the static order in CI even on a commodity tier', () => {
    const order = orderCandidates({
      billing: bill({
        anthropic: { kind: 'metered', provider: 'anthropic' },
        synthetic: { kind: 'flat-rate', provider: 'synthetic' },
      }),
      env: 'ci',
      route: FULL,
      tier: 'sonnet',
    })
    expect(providers(order)).toStrictEqual(['anthropic', 'openai', 'synthetic'])
  })

  it('sinks an exhausted account to the back', () => {
    const order = orderCandidates({
      billing: bill({
        anthropic: {
          headroom: { exhausted: true, fraction: undefined },
          kind: 'metered',
          provider: 'anthropic',
        },
      }),
      env: 'local',
      route: FULL,
      tier: 'sonnet',
    })
    expect(providers(order).at(-1)).toBe('anthropic')
  })

  it('demotes a near-cap account below threshold', () => {
    const order = orderCandidates({
      billing: bill({
        anthropic: {
          headroom: { exhausted: false, fraction: 0.05 },
          kind: 'metered',
          provider: 'anthropic',
        },
      }),
      demoteThreshold: 0.2,
      env: 'local',
      route: FULL,
      tier: 'opus',
    })
    // opus is quality-first (no cost rank), but a near-cap account still sinks.
    expect(providers(order).at(-1)).toBe('anthropic')
  })

  it('preserves the static order when no billing info is present', () => {
    const order = orderCandidates({
      billing: bill({}),
      env: 'local',
      route: FULL,
      tier: 'sonnet',
    })
    expect(providers(order)).toStrictEqual(['anthropic', 'openai', 'synthetic'])
  })

  it('lets an operator prefer-nudge override cost on a commodity tier', () => {
    const order = orderCandidates({
      billing: bill({
        anthropic: { kind: 'metered', prefer: 10, provider: 'anthropic' },
        synthetic: { kind: 'flat-rate', provider: 'synthetic' },
      }),
      env: 'local',
      route: FULL,
      tier: 'sonnet',
    })
    expect(providers(order)[0]).toBe('anthropic')
  })

  it('returns an empty list when nothing is usable', () => {
    const order = orderCandidates({
      billing: bill({}),
      env: 'local',
      route: ctx([], []),
      tier: 'sonnet',
    })
    expect(order).toStrictEqual([])
  })
})

describe('allocateBudget', () => {
  it('splits a total across members then by default weights', () => {
    // total 1200 / 2 members = 600 per member; weights agentic3/code2/grunt1/plan4 (sum 10).
    const caps = allocateBudget({ members: 2, totalUsd: 1200 })
    expect(caps.plan).toBeCloseTo(240)
    expect(caps.agentic).toBeCloseTo(180)
    expect(caps.code).toBeCloseTo(120)
    expect(caps.grunt).toBeCloseTo(60)
    const sum = caps.plan + caps.agentic + caps.code + caps.grunt
    expect(sum).toBeCloseTo(600)
  })

  it('defaults members to 1', () => {
    const caps = allocateBudget({ totalUsd: 100 })
    const sum = caps.plan + caps.agentic + caps.code + caps.grunt
    expect(sum).toBeCloseTo(100)
  })

  it('honors custom weights', () => {
    const caps = allocateBudget({ totalUsd: 100, weights: { plan: 0 } })
    expect(caps.plan).toBe(0)
  })

  it('degrades a non-positive total to zero caps', () => {
    const caps = allocateBudget({ totalUsd: 0 })
    expect(caps.plan).toBe(0)
    expect(caps.grunt).toBe(0)
  })
})
