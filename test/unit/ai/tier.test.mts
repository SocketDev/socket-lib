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
    for (let i = 0, { length } = TIERS; i < length; i += 1) {
      const tier = TIERS[i]!
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
    // Capture each tier's effort rank into a local so the matcher argument is
    // a plain number, not a src-member-expression (no-src-import-in-test-expect).
    const haikuRank = rank[AI_TIER.haiku.effort as keyof typeof rank]
    const sonnetRank = rank[AI_TIER.sonnet.effort as keyof typeof rank]
    const opusRank = rank[AI_TIER.opus.effort as keyof typeof rank]
    expect(haikuRank).toBeLessThan(sonnetRank)
    expect(sonnetRank).toBeLessThan(opusRank)
  })
})

describe('tierToSpawn', () => {
  // Expected values are LITERALS, not built from AI_TIER — a test must not
  // validate src against itself (no-src-import-in-test-expect), and these
  // symbols are too new to import from the -stable snapshot yet.
  it('returns the tier row for a known tier', () => {
    expect(tierToSpawn('opus')).toStrictEqual({
      effort: 'high',
      model: 'claude-opus-4-8',
    })
  })

  it('falls back to sonnet for an unknown label', () => {
    expect(tierToSpawn('bogus' as AiTier)).toStrictEqual({
      effort: 'medium',
      model: 'claude-sonnet-4-6',
    })
  })
})
