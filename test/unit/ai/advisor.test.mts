/**
 * @file Tests for ai/advisor — the composition seam over tier + route +
 *   billing + profile. Covers every TaskClass's default advice, the
 *   billing-reorder path vs the no-billing fallback path, the caller
 *   profileFloor override, and the empty-candidates (nothing installed +
 *   keyed) case.
 */

import { describe, expect, it } from 'vitest'

import { adviseSpawn, PROFILE_FLOOR } from '../../../src/ai/advisor.mts'

import type { CredentialProvider } from '../../../src/ai/credentials.mts'
import type { BillingContext } from '../../../src/ai/route-heuristic.mts'
import type { RouteContext } from '../../../src/ai/route.mts'
import type { AiAgentName } from '../../../src/ai/types.mts'

function ctx(
  available: readonly AiAgentName[],
  keyed: readonly CredentialProvider[],
): RouteContext {
  return { available: new Set(available), keyed: new Set(keyed) }
}

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
const NONE: RouteContext = ctx([], [])

describe('PROFILE_FLOOR', () => {
  // Expected values are LITERALS, not derived from PROFILE_FLOOR itself
  // (no-src-import-in-test-expect) — a test must not validate src against
  // itself.
  it('pins the documented floor per task class', () => {
    expect(PROFILE_FLOOR.plan).toBe('read')
    expect(PROFILE_FLOOR.grunt).toBe('read')
    expect(PROFILE_FLOOR.code).toBe('create')
    expect(PROFILE_FLOOR.agentic).toBe('full')
  })
})

describe('adviseSpawn', () => {
  it('advises the read floor + haiku tier for grunt work', () => {
    const advice = adviseSpawn({ route: FULL, taskClass: 'grunt' })
    expect(advice.tier).toBe('haiku')
    expect(advice.profileFloor).toBe('read')
    expect(advice.profile.tools).toContain('Read')
    expect(advice.profile.tools).not.toContain('Bash')
  })

  it('advises the create floor + sonnet tier for code work', () => {
    const advice = adviseSpawn({ route: FULL, taskClass: 'code' })
    expect(advice.tier).toBe('sonnet')
    expect(advice.profileFloor).toBe('create')
    expect(advice.profile.tools).toContain('Write')
    expect(advice.profile.tools).not.toContain('Bash')
  })

  it('advises the read floor + opus tier for plan work', () => {
    const advice = adviseSpawn({ route: FULL, taskClass: 'plan' })
    expect(advice.tier).toBe('opus')
    expect(advice.profileFloor).toBe('read')
    expect(advice.profile.disallow).toContain('Bash')
  })

  it('advises the full floor + opus tier for agentic work', () => {
    const advice = adviseSpawn({ route: FULL, taskClass: 'agentic' })
    expect(advice.tier).toBe('opus')
    expect(advice.profileFloor).toBe('full')
    expect(advice.profile.allow).toContain('Bash(git commit:*)')
  })

  it('lets a caller override the profile floor', () => {
    const advice = adviseSpawn({
      profileFloor: 'verify',
      route: FULL,
      taskClass: 'grunt',
    })
    expect(advice.profileFloor).toBe('verify')
    expect(advice.profile.tools).toContain('Bash')
  })

  it('falls back to the static availability order when no billing is given', () => {
    const advice = adviseSpawn({ route: FULL, taskClass: 'code' })
    // sonnet chain: claude(anthropic) -> codex(openai) -> opencode(synthetic).
    expect(advice.candidates.map(c => c.engine)).toStrictEqual([
      'claude',
      'codex',
      'opencode',
    ])
  })

  it('reorders candidates by billing policy when a BillingContext is given', () => {
    const billing: BillingContext = {
      anthropic: { kind: 'metered', provider: 'anthropic' },
      openai: { kind: 'subscription', provider: 'openai' },
      synthetic: { kind: 'flat-rate', provider: 'synthetic' },
    }
    const advice = adviseSpawn({
      billing,
      env: 'local',
      route: FULL,
      taskClass: 'code',
    })
    // Commodity tier (sonnet) in local dev promotes the cheapest billing
    // kind (flat-rate) ahead of the Claude head.
    expect(advice.candidates.map(c => c.provider)).toStrictEqual([
      'synthetic',
      'openai',
      'anthropic',
    ])
  })

  it('keeps the static order in CI even with billing supplied', () => {
    const billing: BillingContext = {
      anthropic: { kind: 'metered', provider: 'anthropic' },
      synthetic: { kind: 'flat-rate', provider: 'synthetic' },
    }
    const advice = adviseSpawn({
      billing,
      env: 'ci',
      route: FULL,
      taskClass: 'code',
    })
    expect(advice.candidates.map(c => c.provider)).toStrictEqual([
      'anthropic',
      'openai',
      'synthetic',
    ])
  })

  it('forwards demoteThreshold to the billing reorder', () => {
    const billing: BillingContext = {
      anthropic: {
        headroom: { exhausted: false, fraction: 0.15 },
        kind: 'metered',
        provider: 'anthropic',
      },
    }
    const demoted = adviseSpawn({
      billing,
      demoteThreshold: 0.2,
      env: 'local',
      route: FULL,
      taskClass: 'agentic',
    })
    const notDemoted = adviseSpawn({
      billing,
      demoteThreshold: 0.1,
      env: 'local',
      route: FULL,
      taskClass: 'agentic',
    })
    expect(demoted.candidates.at(-1)?.provider).toBe('anthropic')
    expect(notDemoted.candidates[0]?.provider).toBe('anthropic')
  })

  it('returns advice with an empty candidate list when nothing is usable', () => {
    const advice = adviseSpawn({ route: NONE, taskClass: 'code' })
    expect(advice.candidates).toStrictEqual([])
    expect(advice.reason).toMatch(/no usable engine/)
  })

  it('names the preferred engine in the reason when candidates exist', () => {
    const advice = adviseSpawn({ route: FULL, taskClass: 'agentic' })
    expect(advice.reason).toMatch(/opus tier/)
    expect(advice.reason).toMatch(/full profile floor/)
    expect(advice.reason).toMatch(/agentic work/)
    expect(advice.reason).toMatch(/claude preferred/)
  })

  it('does not mutate its inputs', () => {
    const route = ctx(['claude'], ['anthropic'])
    const before = {
      available: new Set(route.available),
      keyed: new Set(route.keyed),
    }
    adviseSpawn({ route, taskClass: 'code' })
    expect(route.available).toStrictEqual(before.available)
    expect(route.keyed).toStrictEqual(before.keyed)
  })
})
