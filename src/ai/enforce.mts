/**
 * @file Runtime enforcers that keep a spawn honest against the advice
 *   `advisor.mts` produced. Two independent checks:
 *
 *   1. Profile-floor discipline — `PROFILE_FLOOR` (`advisor.mts`) names the
 *      MINIMUM lockdown tier a task class needs. A caller that runs a task at a
 *      MORE capable tier than its floor is over-permissioned — not broken, but
 *      a lockdown-rule smell worth flagging (the CLAUDE.md rule is "choose the
 *      LEAST-capable tier that gets the job done"). ` meetsProfileFloor`
 *      answers "is this capable enough to do the job"; `isOverProfileFloor`
 *      answers the opposite question, "is this MORE capable than the job
 *      needs."
 *   2. Ladder pairing — `AI_TIER` (`tier.mts`) pins each literal Claude tier model
 *      to exactly one reasoning effort. `assertOnLadder` is the runtime twin of
 *      the wheelhouse `ai-spawns-have-paired-effort` static check: it throws
 *      when a caller pairs a known tier model with the wrong effort, or passes
 *      a defined effort to an adaptive-only model (`isAdaptiveOnlyModel`) that
 *      must run with `effort: undefined`.
 */

import { isAdaptiveOnlyModel } from './spawn.mts'
import { AI_TIER } from './tier.mts'

import { ErrorCtor } from '../primordials/error'

import type { AI_PROFILE } from './profiles.mts'
import type { AiTier } from './tier.mts'
import type { AiEffort } from './types.mts'

// Ladder position of each lockdown profile, least → most capable. Mirrors the
// `AI_PROFILE` key order documented in `profiles.mts`.
const PROFILE_RANK: Readonly<Record<keyof typeof AI_PROFILE, number>> = {
  __proto__: null,
  create: 2,
  edit: 1,
  full: 4,
  read: 0,
  verify: 3,
} as unknown as Readonly<Record<keyof typeof AI_PROFILE, number>>

const TIER_NAMES: readonly AiTier[] = ['fable', 'haiku', 'opus', 'sonnet']

// Reverse index: literal AI_TIER model id -> its row's pinned effort, built
// once at module load so `assertOnLadder` doesn't re-walk AI_TIER per call.
const MODEL_TIER_EFFORT: ReadonlyMap<string, AiEffort> = new Map(
  (() => {
    const entries: Array<[string, AiEffort]> = []
    for (let i = 0, { length } = TIER_NAMES; i < length; i += 1) {
      const spawn = AI_TIER[TIER_NAMES[i]!]
      entries.push([spawn.model, spawn.effort])
    }
    return entries
  })(),
)

/**
 * Assert that a `{ model, effort }` pair a caller is about to spawn is
 * correctly paired against the canonical ladder (`AI_TIER`). Two rules:
 *
 * - An adaptive-only model (`isAdaptiveOnlyModel` — fable/mythos) MUST be spawned
 *   with `effort: undefined`; the effort dial does not apply to it.
 * - A literal `AI_TIER` model id MUST be spawned with exactly its row's pinned
 *   effort.
 *
 * A model that is neither adaptive-only nor a literal `AI_TIER` id (a
 * cross-engine model like `gpt-5.5`, or a synthetic/opencode id) has nothing
 * on OUR ladder to check against and passes silently — this guard only
 * covers the Claude tier ladder, mirroring the wheelhouse
 * `ai-spawns-have-paired-effort` static check as a runtime twin.
 */
export function assertOnLadder(
  model: string,
  effort: AiEffort | undefined,
): void {
  if (isAdaptiveOnlyModel(model)) {
    if (effort !== undefined) {
      throw new ErrorCtor(
        `model "${model}" is adaptive-thinking-only; saw effort "${effort}" — pass effort: undefined (fable/mythos ignore the effort dial)`,
      )
    }
    return
  }
  const expected = MODEL_TIER_EFFORT.get(model)
  if (expected === undefined) {
    return
  }
  if (effort !== expected) {
    throw new ErrorCtor(
      `model "${model}" is pinned to effort "${expected}" in AI_TIER; saw "${effort ?? 'undefined'}" — pass effort: "${expected}"`,
    )
  }
}

/**
 * True when `chosen` is MORE capable than the job needs (its rank is strictly
 * above the floor's) — an over-permissioned spawn. This is the lockdown-risk
 * signal `advisor.mts`'s `PROFILE_FLOOR` exists to bound: every extra
 * capability above the floor is attack surface a compromised prompt could
 * reach for no task-shaped reason. Not a hard failure on its own — a caller
 * decides whether to log it, refuse it, or accept a documented exception.
 */
export function isOverProfileFloor(
  chosen: keyof typeof AI_PROFILE,
  floor: keyof typeof AI_PROFILE,
): boolean {
  return profileRank(chosen) > profileRank(floor)
}

/**
 * True when `chosen` is CAPABLE ENOUGH to do the job `floor` describes (its
 * rank is at or above the floor's). The affirmative half of the profile-floor
 * check: a `read`-floored grunt task run at `create` still meets its floor.
 */
export function meetsProfileFloor(
  chosen: keyof typeof AI_PROFILE,
  floor: keyof typeof AI_PROFILE,
): boolean {
  return profileRank(chosen) >= profileRank(floor)
}

/**
 * Ladder position of a lockdown profile (`read` = 0 … `full` = 4). A thin,
 * exported accessor over `PROFILE_RANK` so callers compare profiles without
 * re-deriving the ladder order themselves.
 */
export function profileRank(profile: keyof typeof AI_PROFILE): number {
  return PROFILE_RANK[profile]
}
