/**
 * @file Canonical model + reasoning-effort ladder for AI orchestrators. The
 *   Socket AI-fix / AI-codify orchestrators pick a capability TIER per unit of
 *   work (a lint rule, a hook, a doc edit) and resolve it to a concrete `{
 *   model, effort }` pair. Before this module each orchestrator redefined the
 *   same three-row table, so a model-generation bump (Sonnet 4.6 → 5.0, Opus
 *   4.8 → 4.9) meant editing N files and risked drift. Import `AI_TIER` /
 *   `tierToSpawn` here instead; a generation roll is then a single edit. The
 *   mapping encodes the CLAUDE.md token-spend rule ("match model AND effort to
 *   the job"): a cheap model left on the session's default effort still burns
 *   reasoning a mechanical task never needs, and a premium model on low effort
 *   under-thinks a hard one — so effort is pinned ALONGSIDE the model per
 *   tier.
 */

import type { AiEffort } from './types.mts'

/**
 * The capability tiers, least → most capable. Orchestrators classify each unit
 * of work into one of these (a regex-shaped rewrite → `haiku`; a caller-chain
 * rewrite → `sonnet`; a module split / new-enforcer authoring → `opus`).
 * `fable` is the apex escalation tier — reserve it for the hardest cases (a
 * stuck compiler / native problem, planning + decomposition of a large task),
 * never a first reach, and prefer to ask before selecting it. It is the most
 * expensive model on the board (~2× opus, ~10× haiku output), so an
 * orchestrator should pick the LEAST-capable tier that does the job and
 * escalate to `fable` only after cheaper tiers fail.
 */
export type AiTier = 'fable' | 'haiku' | 'opus' | 'sonnet'

/**
 * Resolved spawn parameters for a tier — spread alongside an `AI_PROFILE` into
 * a `spawnAiAgent` call (`{ ...AI_PROFILE.verify, ...tierToSpawn('opus'),
 * prompt, cwd }`).
 */
export interface TierSpawn {
  readonly effort: AiEffort
  readonly model: string
}

/**
 * Canonical tier → { model, effort }. The single source of truth for which
 * Claude model + effort each tier runs. Bump here on a model generation roll;
 * every orchestrator that imports this picks it up.
 *
 * - `haiku` / low — deterministic, regex-shaped rewrites (identifier rename,
 *   null→undefined, single-token substitution).
 * - `sonnet` / medium — control-flow / caller-chain reasoning (fetch→httpJson,
 *   sync→async), a check script, a doc edit.
 * - `opus` / high — real authoring / refactoring (module split, a brand-new hook
 *   or lint rule with its test).
 * - `fable` / xhigh — apex escalation only: a stuck compiler / native problem
 *   after cheaper tiers fail, or planning + decomposition of a large task whose
 *   chunks then run on cheaper tiers. Most expensive model on the board; never
 *   a default.
 */
export const AI_TIER: Readonly<Record<AiTier, TierSpawn>> = {
  __proto__: null,
  fable: { effort: 'xhigh', model: 'claude-fable-5' },
  haiku: { effort: 'low', model: 'claude-haiku-4-5' },
  opus: { effort: 'high', model: 'claude-opus-4-8' },
  sonnet: { effort: 'medium', model: 'claude-sonnet-4-6' },
} as unknown as Readonly<Record<AiTier, TierSpawn>>

/**
 * Resolve a tier label to its `{ model, effort }` spawn pair. A convenience
 * over indexing `AI_TIER` directly; returns the `sonnet` row for an unknown
 * label so a caller that hands in a stray string degrades to the safe default
 * rather than producing `undefined` model/effort.
 */
export function tierToSpawn(tier: AiTier): TierSpawn {
  return AI_TIER[tier] ?? AI_TIER.sonnet
}
