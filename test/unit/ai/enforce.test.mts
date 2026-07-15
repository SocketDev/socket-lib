/**
 * @file Tests for ai/enforce — the profile-floor rank helpers and the
 *   AI_TIER model/effort ladder runtime guard. Covers every AI_PROFILE rank
 *   pairing, the capable-enough vs over-permissioned distinction, a passing
 *   assertOnLadder call per tier, the mismatched-effort throw, the
 *   adaptive-only (fable/mythos) pass + throw paths, and the pass-through for
 *   a model that isn't on the ladder at all.
 */

import { describe, expect, it } from 'vitest'

import {
  assertOnLadder,
  isOverProfileFloor,
  meetsProfileFloor,
  profileRank,
} from '../../../src/ai/enforce.mts'

describe('profileRank', () => {
  // Expected values are LITERALS (no-src-import-in-test-expect) — the ladder
  // order documented in profiles.mts: read < edit < create < verify < full.
  it('ranks the ladder least to most capable', () => {
    expect(profileRank('read')).toBe(0)
    expect(profileRank('edit')).toBe(1)
    expect(profileRank('create')).toBe(2)
    expect(profileRank('verify')).toBe(3)
    expect(profileRank('full')).toBe(4)
  })
})

describe('meetsProfileFloor', () => {
  it('is true when chosen is exactly the floor', () => {
    expect(meetsProfileFloor('create', 'create')).toBe(true)
  })

  it('is true when chosen is more capable than the floor', () => {
    expect(meetsProfileFloor('full', 'read')).toBe(true)
  })

  it('is false when chosen is less capable than the floor', () => {
    expect(meetsProfileFloor('read', 'create')).toBe(false)
  })
})

describe('isOverProfileFloor', () => {
  it('is false when chosen exactly meets the floor', () => {
    expect(isOverProfileFloor('create', 'create')).toBe(false)
  })

  it('is true when chosen is strictly more capable than the floor', () => {
    expect(isOverProfileFloor('full', 'read')).toBe(true)
  })

  it('is false when chosen is less capable than the floor', () => {
    expect(isOverProfileFloor('read', 'create')).toBe(false)
  })
})

describe('assertOnLadder', () => {
  it('passes for every AI_TIER model paired with its pinned effort', () => {
    expect(() => assertOnLadder('claude-haiku-4-5', 'low')).not.toThrow()
    expect(() => assertOnLadder('claude-sonnet-4-6', 'medium')).not.toThrow()
    expect(() => assertOnLadder('claude-opus-4-8', 'high')).not.toThrow()
  })

  it('throws when a tier model is paired with the wrong effort', () => {
    expect(() => assertOnLadder('claude-sonnet-4-6', 'high')).toThrow(
      /pinned to effort "medium"/,
    )
  })

  it('throws when a tier model is paired with no effort at all', () => {
    expect(() => assertOnLadder('claude-opus-4-8', undefined)).toThrow(
      /pinned to effort "high"/,
    )
  })

  it('passes for the adaptive-only fable model with effort undefined', () => {
    expect(() => assertOnLadder('claude-fable-5', undefined)).not.toThrow()
  })

  it('passes for the adaptive-only mythos alias with effort undefined', () => {
    expect(() => assertOnLadder('mythos', undefined)).not.toThrow()
  })

  it('throws when an adaptive-only model is given a defined effort', () => {
    expect(() => assertOnLadder('claude-fable-5', 'xhigh')).toThrow(
      /adaptive-thinking-only/,
    )
  })

  it('passes silently for a model not on the AI_TIER ladder', () => {
    expect(() => assertOnLadder('gpt-5.5', 'high')).not.toThrow()
    expect(() => assertOnLadder('gpt-5.5', undefined)).not.toThrow()
  })
})
