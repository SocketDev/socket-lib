/**
 * @file Tests for ai/route — availability-gated tier routing. A tier resolves
 *   to its preferred engine only when that engine exists AND is keyed; else it
 *   falls back to a cross-engine equivalent.
 */

import { describe, expect, it } from 'vitest'

import {
  isCandidateUsable,
  resolveTier,
  TIER_CHAINS,
} from '../../../src/ai/route.mts'

import type { CredentialProvider } from '../../../src/ai/credentials.mts'
import type { RouteContext } from '../../../src/ai/route.mts'
import type { AiAgentName } from '../../../src/ai/types.mts'

function ctx(
  available: readonly AiAgentName[],
  keyed: readonly CredentialProvider[],
): RouteContext {
  return { available: new Set(available), keyed: new Set(keyed) }
}

describe('TIER_CHAINS', () => {
  it('heads every chain with the preferred Claude candidate', () => {
    for (const tier of ['fable', 'opus', 'sonnet', 'haiku'] as const) {
      const head = TIER_CHAINS[tier][0]!
      expect(head.engine).toBe('claude')
      expect(head.provider).toBe('anthropic')
    }
  })

  it('drops effort for the fable head (adaptive-thinking-only)', () => {
    expect(TIER_CHAINS.fable[0]!.effort).toBeUndefined()
    expect(TIER_CHAINS.fable[0]!.model).toBe('claude-fable-5')
  })

  it('uses gpt-5.5 for every codex fallback', () => {
    for (const tier of ['fable', 'opus', 'sonnet', 'haiku'] as const) {
      const codex = TIER_CHAINS[tier].find(c => c.engine === 'codex')!
      expect(codex.model).toBe('gpt-5.5')
    }
  })
})

describe('isCandidateUsable', () => {
  it('requires both the engine present and the provider keyed', () => {
    const cand = TIER_CHAINS.fable[0]!
    expect(isCandidateUsable(cand, ctx(['claude'], ['anthropic']))).toBe(true)
    expect(isCandidateUsable(cand, ctx(['claude'], []))).toBe(false)
    expect(isCandidateUsable(cand, ctx([], ['anthropic']))).toBe(false)
  })
})

describe('resolveTier', () => {
  it('returns the preferred Claude candidate when available + keyed', () => {
    const res = resolveTier('fable', ctx(['claude'], ['anthropic']))
    expect(res).toStrictEqual({
      candidate: {
        effort: undefined,
        engine: 'claude',
        model: 'claude-fable-5',
        provider: 'anthropic',
      },
      reason: 'preferred',
    })
  })

  it('falls back to codex gpt-5.5 xhigh when claude is unavailable', () => {
    const res = resolveTier('fable', ctx(['codex'], ['openai']))
    expect(res?.reason).toBe('fellback')
    expect(res?.from).toBe('fable')
    expect(res?.candidate.engine).toBe('codex')
    expect(res?.candidate.model).toBe('gpt-5.5')
    expect(res?.candidate.effort).toBe('xhigh')
  })

  it('falls back when claude is present but UNKEYED (expired/no key)', () => {
    const res = resolveTier('fable', ctx(['claude', 'codex'], ['openai']))
    expect(res?.reason).toBe('fellback')
    expect(res?.candidate.engine).toBe('codex')
  })

  it('falls back to the open-weight equivalent when only opencode is usable', () => {
    const res = resolveTier('fable', ctx(['opencode'], ['fireworks']))
    expect(res?.candidate.engine).toBe('opencode')
    expect(res?.candidate.provider).toBe('fireworks')
  })

  it('returns undefined when nothing in the chain is usable', () => {
    expect(resolveTier('fable', ctx([], []))).toBeUndefined()
    // CLI present but no key for it anywhere.
    expect(resolveTier('opus', ctx(['claude'], ['openai']))).toBeUndefined()
  })

  it('routes each tier to its own preferred model', () => {
    const claudeEverywhere = ctx(['claude'], ['anthropic'])
    expect(resolveTier('opus', claudeEverywhere)?.candidate.model).toBe(
      'claude-opus-4-8',
    )
    expect(resolveTier('sonnet', claudeEverywhere)?.candidate.model).toBe(
      'claude-sonnet-4-6',
    )
    expect(resolveTier('haiku', claudeEverywhere)?.candidate.model).toBe(
      'claude-haiku-4-5',
    )
  })
})
