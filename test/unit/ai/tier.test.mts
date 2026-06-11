/**
 * @file Tests for ai/tier — the canonical model + effort ladder orchestrators
 *   share so the mapping lives in one place.
 */

import { describe, expect, it } from 'vitest'

import { AI_TIER, tierToSpawn } from '../../../src/ai/tier.mts'

import type { AiTier } from '../../../src/ai/tier.mts'

const TIERS: readonly AiTier[] = ['haiku', 'sonnet', 'opus']

describe('AI_TIER', () => {
  it('maps each tier to a model + effort', () => {
    for (const tier of TIERS) {
      expect(AI_TIER[tier].model).toMatch(/^claude-/)
      expect(AI_TIER[tier].effort).toBeDefined()
    }
  })

  it('pins the documented model + effort per tier', () => {
    expect(AI_TIER.haiku).toStrictEqual({
      effort: 'low',
      model: 'claude-haiku-4-5',
    })
    expect(AI_TIER.sonnet).toStrictEqual({
      effort: 'medium',
      model: 'claude-sonnet-4-6',
    })
    expect(AI_TIER.opus).toStrictEqual({
      effort: 'high',
      model: 'claude-opus-4-8',
    })
  })

  it('effort escalates with the tier (low → medium → high)', () => {
    const rank = { high: 2, low: 0, medium: 1 } as const
    expect(rank[AI_TIER.haiku.effort as keyof typeof rank]).toBeLessThan(
      rank[AI_TIER.sonnet.effort as keyof typeof rank],
    )
    expect(rank[AI_TIER.sonnet.effort as keyof typeof rank]).toBeLessThan(
      rank[AI_TIER.opus.effort as keyof typeof rank],
    )
  })
})

describe('tierToSpawn', () => {
  it('returns the tier row for a known tier', () => {
    expect(tierToSpawn('opus')).toStrictEqual(AI_TIER.opus)
  })

  it('falls back to sonnet for an unknown label', () => {
    expect(tierToSpawn('bogus' as AiTier)).toStrictEqual(AI_TIER.sonnet)
  })
})
