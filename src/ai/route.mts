/**
 * @file Availability-gated tier routing. `tier.mts` says which model+effort is
 *   the "perfect" choice for a unit of work; this module turns that hint into a
 *   concrete spawn target that ACTUALLY EXISTS on the machine. A tier resolves
 *   to its preferred engine only when that engine's CLI is installed AND a
 *   credential for it is resolvable; otherwise the resolver walks a
 *   cross-engine equivalence ladder (Claude → Codex → an open-weight provider
 *   via opencode) and returns the best available equivalent. Why gate on
 *   existence: a fleet machine may have Claude but no Codex, or Codex but an
 *   expired Claude key, or neither plus an opencode/synthetic seat. Hard-coding
 *   `fable` then fails at spawn time; routing here degrades gracefully and
 *   tells the caller WHY (the `reason`), so a skill can log "fell back to codex
 *   gpt-5.5 (claude unavailable)" instead of crashing. Pure given an
 *   availability/keyed context — no I/O — so callers fan out their `which` +
 *   credential probes once and pass the result in. Pairs with `buildArgs` in
 *   `spawn.mts`: a Fable candidate carries `effort: undefined` because Fable is
 *   adaptive-thinking-only and the spawn layer omits `--effort` for it anyway.
 */

import { AI_TIER } from './tier.mts'

import type { CredentialProvider } from './credentials.mts'
import type { AiAgentName, AiEffort } from './types.mts'
import type { AiTier } from './tier.mts'

/**
 * A concrete, spawnable target: which CLI engine to run, the model id, the
 * reasoning effort to pass (undefined when the model ignores effort, e.g.
 * Fable), and the credential provider whose key gates it.
 */
export interface TierCandidate {
  readonly effort: AiEffort | undefined
  readonly engine: AiAgentName
  readonly model: string
  readonly provider: CredentialProvider
}

/**
 * Why the resolver returned what it did. - `preferred` — the tier's
 * first-choice engine was available + keyed. - `fellback` — the preferred
 * engine was missing/unkeyed; an equivalent on another engine was used (`from`
 * names the original tier).
 */
export type TierResolveReason = 'fellback' | 'preferred'

export interface TierResolution {
  readonly candidate: TierCandidate
  readonly reason: TierResolveReason
  // Present only when `reason === 'fellback'`: the tier originally asked for.
  readonly from?: AiTier | undefined
}

/**
 * The context a caller probes once and passes in: which engine CLIs exist, and
 * which credential providers have a resolvable key. Both are sets so the
 * resolver stays pure (no `which` / keychain I/O of its own).
 */
export interface RouteContext {
  readonly available: ReadonlySet<AiAgentName>
  readonly keyed: ReadonlySet<CredentialProvider>
}

/**
 * Per-tier preference chain, most-preferred-first. The head is the "perfect"
 * Claude choice from `AI_TIER`; the tail is the cross-engine equivalent ladder
 * (Codex, then an open-weight provider reached through opencode). Effort is the
 * shared `AiEffort` vocab; `buildArgs` translates per engine (codex clamps
 * `max`→`xhigh`, Fable drops effort entirely).
 *
 * The Claude head reuses `AI_TIER` so a model-generation bump stays a single
 * edit there. Fable's head carries `effort: undefined` — it is adaptive-only.
 */
const FABLE = AI_TIER.fable
const OPUS = AI_TIER.opus
const SONNET = AI_TIER.sonnet
const HAIKU = AI_TIER.haiku

export const TIER_CHAINS: Readonly<Record<AiTier, readonly TierCandidate[]>> = {
  __proto__: null,
  fable: [
    {
      effort: undefined,
      engine: 'claude',
      model: FABLE.model,
      provider: 'anthropic',
    },
    { effort: 'xhigh', engine: 'codex', model: 'gpt-5.5', provider: 'openai' },
    {
      effort: 'xhigh',
      engine: 'opencode',
      model: 'fireworks-ai/accounts/fireworks/models/glm-5p1',
      provider: 'fireworks',
    },
  ],
  opus: [
    {
      effort: OPUS.effort,
      engine: 'claude',
      model: OPUS.model,
      provider: 'anthropic',
    },
    { effort: 'high', engine: 'codex', model: 'gpt-5.5', provider: 'openai' },
    {
      effort: 'high',
      engine: 'opencode',
      model: 'fireworks-ai/accounts/fireworks/models/glm-5p1',
      provider: 'fireworks',
    },
  ],
  sonnet: [
    {
      effort: SONNET.effort,
      engine: 'claude',
      model: SONNET.model,
      provider: 'anthropic',
    },
    { effort: 'medium', engine: 'codex', model: 'gpt-5.5', provider: 'openai' },
    {
      effort: 'medium',
      engine: 'opencode',
      model: 'synthetic/hf:moonshotai/Kimi-K2.5',
      provider: 'synthetic',
    },
  ],
  haiku: [
    {
      effort: HAIKU.effort,
      engine: 'claude',
      model: HAIKU.model,
      provider: 'anthropic',
    },
    { effort: 'low', engine: 'codex', model: 'gpt-5.5', provider: 'openai' },
    {
      effort: 'low',
      engine: 'opencode',
      model: 'synthetic/hf:moonshotai/Kimi-K2.5',
      provider: 'synthetic',
    },
  ],
} as unknown as Readonly<Record<AiTier, readonly TierCandidate[]>>

/**
 * A candidate is usable when its engine CLI exists AND a credential for its
 * provider is resolvable. Both gates matter: an installed Claude with an
 * expired key is as unusable as a missing CLI.
 */
export function isCandidateUsable(
  candidate: TierCandidate,
  ctx: RouteContext,
): boolean {
  return (
    ctx.available.has(candidate.engine) && ctx.keyed.has(candidate.provider)
  )
}

/**
 * Resolve a tier to the best available concrete target. Prefers the tier's
 * first-choice (Claude) candidate; if its engine is missing or unkeyed, walks
 * the cross-engine equivalence ladder and returns the first usable equivalent,
 * tagging the result `fellback` with the original tier in `from`. Returns
 * `undefined` only when NOTHING in the chain is usable — the caller then skips
 * the work or surfaces a "no AI engine available" message.
 */
export function resolveTier(
  tier: AiTier,
  ctx: RouteContext,
): TierResolution | undefined {
  const chain = TIER_CHAINS[tier] ?? TIER_CHAINS.sonnet
  for (let i = 0, { length } = chain; i < length; i += 1) {
    const candidate = chain[i]!
    if (isCandidateUsable(candidate, ctx)) {
      return i === 0
        ? { candidate, reason: 'preferred' }
        : { candidate, from: tier, reason: 'fellback' }
    }
  }
  return undefined
}

/**
 * The ORDERED list of usable candidates for a tier — the runtime-fallback
 * sequence. `resolveTier` returns only the single best pick (good when you
 * trust it will work); this returns every usable candidate in preference order
 * so a caller can advance to the next when one fails AT RUNTIME — e.g. the
 * preferred model is installed + keyed (so it passes `isCandidateUsable`) yet
 * its CLI reports it offline at spawn ("Claude Fable 5 is currently
 * unavailable"). The static check can't predict an outage; only the spawn
 * result can, so the caller walks this list until a spawn returns without the
 * `unavailable` flag. Empty when nothing in the chain is usable.
 */
export function usableTierCandidates(
  tier: AiTier,
  ctx: RouteContext,
): TierCandidate[] {
  const chain = TIER_CHAINS[tier] ?? TIER_CHAINS.sonnet
  return chain.filter(c => isCandidateUsable(c, ctx))
}
