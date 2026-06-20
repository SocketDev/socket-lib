/**
 * @file Billing-aware routing heuristic — a PURE policy layer over `route.mts`.
 *   `route.mts` answers "which cross-engine candidates for this tier are
 *   installed + keyed, in static preference order"; this module answers "given
 *   how each provider is BILLED (a subscription seat vs a flat-rate plan vs
 *   metered dollars), how much budget headroom remains, and whether we're in
 *   local dev or a locked-down CI — REORDER those candidates so the cheapest
 *   ration that still meets the tier's quality bar runs first." It is pure (no
 *   I/O): a caller fans out the billing / headroom probes once (the discovery
 *   layer) and passes a `BillingContext` in, exactly as `route.mts` takes a
 *   probed `RouteContext`. The candidates within a tier chain are cross-engine
 *   EQUIVALENTS at that capability level, so reordering them by cost is safe —
 *   the tier already fixed the quality bar. NO per-user constants live here.
 *   Every dollar limit, plan tier, member count, and promo window is DATA on
 *   the passed-in context; this file is formula + ordering only, so the same
 *   policy serves a metered org with a big budget, a free-promo subscription
 *   seat, a shared team pool, or a member with no credentials at all. Even
 *   "which model is suspended" is not encoded here — that is the
 *   route/availability layer's concern. Two design choices keep it a "sweet
 *   spot" rather than a blunt cost-sort: high-value tiers (opus/fable) stay
 *   QUALITY-FIRST (the Claude head leads) and only DEMOTE an account under
 *   budget pressure, while commodity tiers (haiku/sonnet) in local dev PROMOTE
 *   the cheapest equivalent to preserve the metered budget for work that needs
 *   it; and CI keeps the locked static order so a headless run never reorders
 *   away from its single available provider.
 */

import { usableTierCandidates } from './route.mts'

import type { CredentialProvider } from './credentials.mts'
import type { RouteContext, TierCandidate } from './route.mts'
import type { AiTier } from './tier.mts'

/**
 * How a provider's credential is billed, which decides what the marginal token
 * actually costs:
 *
 * - `flat-rate` — a fixed monthly plan with a usage window (e.g. N requests per
 *   5h). Marginal cost is $0 while the window has room.
 * - `metered` — pay per token against a (usually large, readable) monthly spend
 *   limit. Marginal cost is real dollars.
 * - `subscription` — a seat (Claude Max, ChatGPT Pro) with an opaque weekly
 *   quota. Marginal cost is $0 until the quota is hit, then it stops.
 */
export type BillingKind = 'flat-rate' | 'metered' | 'subscription'

/**
 * Where routing is running. `local` dev has the full discovered provider set
 * and may chase the cheapest equivalent; `ci` is locked to the secrets actually
 * present (often a single provider) under the four-flag lockdown, so the policy
 * keeps the static order and never reorders away from the one available lane.
 */
export type RoutingEnv = 'ci' | 'local'

/**
 * The shape of a unit of work, mapped to a capability tier by
 * `taskClassToTier`. Orthogonal to billing: the class fixes the quality bar,
 * billing decides which equivalent at that bar is cheapest.
 */
export type TaskClass = 'agentic' | 'code' | 'grunt' | 'plan'

/**
 * Remaining-headroom signal for one account, as read by the discovery layer
 * from the provider's live API (metered: spend ÷ limit; flat-rate: window used
 * ÷ window limit). `fraction` is remaining headroom in [0, 1] (1 = full, 0 =
 * none), or `undefined` when no signal is available — a subscription seat with
 * no programmatic quota read, which the policy then treats reactively.
 * `exhausted` is the hard stop: a cap was hit or a 429 was observed, so the
 * account should fall to the back of the order regardless of `fraction`.
 */
export interface BillingHeadroom {
  readonly exhausted: boolean
  readonly fraction: number | undefined
}

/**
 * One provider's billing situation for the credential that will actually be
 * used (the resolver yields one token per provider, so one account per provider
 * is the routing-relevant view). Multi-account-per-provider accounting belongs
 * to the budget layer, not the candidate order.
 */
export interface BillingAccount {
  readonly headroom?: BillingHeadroom | undefined
  readonly kind: BillingKind
  // Optional operator nudge: higher sorts earlier (e.g. "prefer Codex for
  // execute"). A pure tiebreak knob; never a per-user dollar figure.
  readonly prefer?: number | undefined
  readonly provider: CredentialProvider
}

/**
 * The per-provider billing view a caller probes once and passes in — the
 * billing analog of `RouteContext`. Keyed by provider; a provider absent from
 * the map has no known billing signal and is left in static order.
 */
export type BillingContext = Readonly<
  Partial<Record<CredentialProvider, BillingAccount>>
>

/**
 * Canonical task-class → tier. The class fixes the capability bar; the tier
 * chain then offers cross-engine equivalents at that bar for billing to
 * reorder.
 *
 * - `grunt` → `haiku` — classify / summarize / single-token rewrites.
 * - `code` → `sonnet` — control-flow / caller-chain edits, feature work.
 * - `agentic` → `opus` — long tool-use loops, high-value autonomous work.
 * - `plan` → `opus` — decomposition / architecture (escalate to `fable` only
 *   explicitly, never by default — and only when it is not suspended).
 */
export const TASK_CLASS_TIER: Readonly<Record<TaskClass, AiTier>> = {
  __proto__: null,
  agentic: 'opus',
  code: 'sonnet',
  grunt: 'haiku',
  plan: 'opus',
} as unknown as Readonly<Record<TaskClass, AiTier>>

/**
 * Marginal-cost rank by billing kind, cheapest ration first (lower =
 * preferred). Used only for commodity tiers in local dev — high-value tiers
 * stay quality-first. Flat-rate and subscription are both $0-until-cap;
 * flat-rate leads because its window resets fast (hours) vs a subscription's
 * weekly cap.
 */
export const COST_RANK: Readonly<Record<BillingKind, number>> = {
  __proto__: null,
  'flat-rate': 0,
  metered: 2,
  subscription: 1,
} as unknown as Readonly<Record<BillingKind, number>>

/**
 * Default per-task-class budget weights for `allocateBudget`. Reserves more of
 * a member's share for high-value work (plan/agentic) than for bulk
 * (grunt/code). Overridable per call — these are sane defaults, not per-user
 * values.
 */
export const DEFAULT_TASK_CLASS_WEIGHTS: Readonly<Record<TaskClass, number>> = {
  __proto__: null,
  agentic: 3,
  code: 2,
  grunt: 1,
  plan: 4,
} as unknown as Readonly<Record<TaskClass, number>>

/**
 * Headroom fraction at or below which a metered/flat-rate account is demoted
 * (predictive backoff before the hard cap). A config knob with a sane default;
 * callers override per `orderCandidates` call.
 */
export const DEFAULT_DEMOTE_THRESHOLD = 0.2

// Tiers where commodity work should chase the cheapest equivalent. High-value
// tiers (opus/fable) are absent: they stay quality-first and only demote on
// budget pressure.
const BULK_TIERS: ReadonlySet<AiTier> = new Set<AiTier>(['haiku', 'sonnet'])

// Score bands, kept far apart so a hard stop always outranks a soft demote and a
// soft demote always outranks a cost preference. Pure ordering — no dollars.
const SCORE_NEAR_CAP = 100
const SCORE_EXHAUSTED = 10_000

const TASK_CLASSES: readonly TaskClass[] = ['agentic', 'code', 'grunt', 'plan']

/**
 * Per-task-class dollar caps. A generic allocation, not a per-user table —
 * computed from a total + member count + weights, all of which are inputs.
 */
export type BudgetAllocation = Readonly<Record<TaskClass, number>>

export interface BudgetAllocationOptions {
  // Total monthly budget to divide (an org limit, a team pool, …). Caller
  // supplies it from private config / a live spend reader; never hard-coded.
  readonly totalUsd: number
  // People sharing `totalUsd`; defaults to 1 (the whole budget is one member's).
  readonly members?: number | undefined
  // Per-class weights; merged over DEFAULT_TASK_CLASS_WEIGHTS.
  readonly weights?: Readonly<Partial<Record<TaskClass, number>>> | undefined
}

/**
 * Turn a total budget into reasonable per-member, per-task-class caps by a
 * generic formula: split the total evenly across members, then distribute each
 * member's share across task classes proportional to their weights. The numbers
 * in are private; the formula is generic and committed. A non-positive total or
 * member count degrades to zero caps rather than throwing.
 */
export function allocateBudget(
  options: BudgetAllocationOptions,
): BudgetAllocation {
  const opts = { __proto__: null, ...options } as BudgetAllocationOptions
  const members = opts.members && opts.members > 0 ? opts.members : 1
  const total = opts.totalUsd > 0 ? opts.totalUsd : 0
  const perMember = total / members
  const weights = {
    __proto__: null,
    ...DEFAULT_TASK_CLASS_WEIGHTS,
    ...opts.weights,
  } as Record<TaskClass, number>
  let totalWeight = 0
  for (let i = 0, { length } = TASK_CLASSES; i < length; i += 1) {
    totalWeight += weights[TASK_CLASSES[i]!] ?? 0
  }
  const divisor = totalWeight > 0 ? totalWeight : 1
  const out = { __proto__: null } as Record<TaskClass, number>
  for (let i = 0, { length } = TASK_CLASSES; i < length; i += 1) {
    const taskClass = TASK_CLASSES[i]!
    out[taskClass] = (perMember * (weights[taskClass] ?? 0)) / divisor
  }
  return out as BudgetAllocation
}

export interface CandidateScoreOptions {
  readonly account: BillingAccount | undefined
  readonly demoteThreshold: number
  // Whether cost rank applies (commodity tier in local dev).
  readonly promoteCheap: boolean
}

/**
 * Score one candidate for ordering (lower sorts earlier). A candidate with no
 * known billing account scores neutral so it keeps its static position. The
 * bands: a hard-exhausted account sinks to the back; a near-cap account is
 * demoted; cost rank nudges commodity tiers toward the cheapest ration; an
 * operator `prefer` nudge pulls a provider earlier. Pure.
 */
export function candidateScore(options: CandidateScoreOptions): number {
  const opts = { __proto__: null, ...options } as CandidateScoreOptions
  const { account } = opts
  if (!account) {
    return 0
  }
  let score = 0
  const { headroom } = account
  if (headroom?.exhausted) {
    score += SCORE_EXHAUSTED
  } else if (
    typeof headroom?.fraction === 'number' &&
    headroom.fraction <= opts.demoteThreshold
  ) {
    score += SCORE_NEAR_CAP
  }
  if (opts.promoteCheap) {
    score += COST_RANK[account.kind] ?? 0
  }
  if (typeof account.prefer === 'number') {
    score -= account.prefer
  }
  return score
}

export interface OrderCandidatesOptions {
  readonly billing: BillingContext
  // Headroom fraction at/below which an account is demoted; defaults to
  // DEFAULT_DEMOTE_THRESHOLD.
  readonly demoteThreshold?: number | undefined
  // Where routing runs; defaults to 'local'. 'ci' keeps the static order.
  readonly env?: RoutingEnv | undefined
  readonly route: RouteContext
  readonly tier: AiTier
}

/**
 * Reorder a tier's usable candidates by the billing policy, returning the
 * runtime-fallback sequence (most-preferred first). Wraps
 * `usableTierCandidates` — it never mutates the static `TIER_CHAINS`. The sort
 * is stable on the original preference index, so candidates that score equal
 * keep their static order (the Claude head stays first among equals).
 *
 * - In `ci`, or on a high-value tier (opus/fable), cost rank does NOT apply: the
 *   static quality-first order holds and only budget demotion / exhaustion
 *   reorders it.
 * - In `local` on a commodity tier (haiku/sonnet), the cheapest billing kind is
 *   promoted ahead of a pricier equivalent, preserving the metered budget for
 *   the work that needs it.
 */
export function orderCandidates(
  options: OrderCandidatesOptions,
): TierCandidate[] {
  const opts = { __proto__: null, ...options } as OrderCandidatesOptions
  const env = opts.env ?? 'local'
  const demoteThreshold = opts.demoteThreshold ?? DEFAULT_DEMOTE_THRESHOLD
  const promoteCheap = env === 'local' && BULK_TIERS.has(opts.tier)
  const usable = usableTierCandidates(opts.tier, opts.route)
  const scored = usable.map((candidate, index) => ({
    candidate,
    index,
    score: candidateScore({
      account: opts.billing[candidate.provider],
      demoteThreshold,
      promoteCheap,
    }),
  }))
  scored.sort((a, b) => a.score - b.score || a.index - b.index)
  return scored.map(entry => entry.candidate)
}

/**
 * Resolve a task class to its capability tier, defaulting to `sonnet` for an
 * unknown label so a stray string degrades safely rather than yielding
 * `undefined`.
 */
export function taskClassToTier(taskClass: TaskClass): AiTier {
  return TASK_CLASS_TIER[taskClass] ?? 'sonnet'
}
