/**
 * @file Spawn advisor — composes tier + route + billing + profile into ONE
 *   call so callers stop hand-wiring the AI stack layer by layer. Given a
 *   `TaskClass` and a probed `RouteContext` (plus an optional
 *   `BillingContext`), `adviseSpawn` resolves the capability tier
 *   (`taskClassToTier`), orders the usable cross-engine candidates
 *   (billing-aware via `orderCandidates` when billing is supplied, the static
 *   availability order via `usableTierCandidates` otherwise), and picks the
 *   LEAST-capable `AI_PROFILE` lockdown tier the task class needs. Pure — no
 *   I/O, no spawn: the caller still probes availability/billing once
 *   (`billing-context.mts`) and hands the resulting `RouteContext` /
 *   `BillingContext` in, then calls `spawnAiAgent` / `spawnTierWithFallback`
 *   with the advice. Modeled on the "advisor" pattern from Copilot-style
 *   CLIs: one seam a skill consults instead of importing four modules and
 *   reimplementing the same composition at every call site.
 */

import { AI_PROFILE } from './profiles.mts'
import { orderCandidates, taskClassToTier } from './route-heuristic.mts'
import { usableTierCandidates } from './route.mts'

import type { AiProfile } from './profiles.mts'
import type {
  BillingContext,
  RoutingEnv,
  TaskClass,
} from './route-heuristic.mts'
import type { RouteContext, TierCandidate } from './route.mts'
import type { AiTier } from './tier.mts'

/**
 * The LEAST-capable `AI_PROFILE` lockdown tier each task class needs — a
 * floor, not a ceiling. A caller may run a task at a MORE capable tier (that
 * is what `isOverProfileFloor` in `enforce.mts` flags as over-permissioned),
 * but never a less capable one and still expect the work to land.
 *
 * - `plan` → `read` — planning inspects and proposes; it never mutates a repo, so
 *   the research-only tier (Read/Grep/Glob/WebFetch/WebSearch, no
 *   Edit/Write/Bash) is sufficient.
 * - `grunt` → `read` — classify / summarize / single-token rewrites are
 *   read-and-report; the caller applies the rewrite, the agent does not.
 * - `code` → `create` — control-flow / caller-chain edits and feature work author
 *   AND create files (a new test, a split module), but do not need Bash to do
 *   the job.
 * - `agentic` → `full` — long autonomous tool-use loops that land their own work
 *   need the whole ladder: author, self-verify, and commit.
 */
export const PROFILE_FLOOR: Readonly<
  Record<TaskClass, keyof typeof AI_PROFILE>
> = {
  __proto__: null,
  agentic: 'full',
  code: 'create',
  grunt: 'read',
  plan: 'read',
} as unknown as Readonly<Record<TaskClass, keyof typeof AI_PROFILE>>

export interface AdviseSpawnOptions {
  // Best-effort billing view (`billing-context.mts`); when omitted, candidate
  // order falls back to the static availability order (`usableTierCandidates`)
  // instead of the billing-aware reorder.
  readonly billing?: BillingContext | undefined
  // Headroom fraction at/below which a near-cap account is demoted; forwarded
  // to `orderCandidates` (defaults to `DEFAULT_DEMOTE_THRESHOLD` there).
  readonly demoteThreshold?: number | undefined
  // Where routing runs; forwarded to `orderCandidates` (defaults to `local`
  // there, which allows cost-based reordering).
  readonly env?: RoutingEnv | undefined
  // Caller override for the lockdown floor; wins over `PROFILE_FLOOR`. Use
  // when a task class's default floor is insufficient for a specific call
  // (never to go BELOW the default — that reintroduces the risk the floor
  // exists to bound).
  readonly profileFloor?: keyof typeof AI_PROFILE | undefined
  // Probed engine/credential availability (`route.mts`).
  readonly route: RouteContext
  // The shape of the unit of work; fixes the capability tier.
  readonly taskClass: TaskClass
}

/**
 * A complete, ready-to-spawn plan: which tier, which lockdown profile floor
 * (and its concrete `AiProfile`), the ordered candidate list to walk, and a
 * human-readable `reason` a caller can log alongside the spawn.
 */
export interface SpawnAdvice {
  readonly candidates: TierCandidate[]
  readonly profile: AiProfile
  readonly profileFloor: keyof typeof AI_PROFILE
  readonly reason: string
  readonly tier: AiTier
}

/**
 * Advise a complete spawn plan for one unit of work. Resolves the tier from
 * the task class, orders the usable candidates (billing-aware when `billing`
 * is supplied), and picks the profile floor (`options.profileFloor` override,
 * else `PROFILE_FLOOR[taskClass]`). Never throws and never probes anything —
 * an empty `route`/`billing` simply yields advice with an empty
 * `candidates` list and a `reason` that says so, so a caller can surface "no
 * usable AI engine" without a try/catch.
 */
export function adviseSpawn(options: AdviseSpawnOptions): SpawnAdvice {
  const opts = { __proto__: null, ...options } as AdviseSpawnOptions
  const tier = taskClassToTier(opts.taskClass)
  const candidates = opts.billing
    ? orderCandidates({
        billing: opts.billing,
        demoteThreshold: opts.demoteThreshold,
        env: opts.env,
        route: opts.route,
        tier,
      })
    : usableTierCandidates(tier, opts.route)
  const profileFloor = opts.profileFloor ?? PROFILE_FLOOR[opts.taskClass]
  const profile = AI_PROFILE[profileFloor]
  const reason =
    candidates.length > 0
      ? `advised ${tier} tier, ${profileFloor} profile floor for ${opts.taskClass} work; ${candidates.length} usable candidate${candidates.length === 1 ? '' : 's'}, ${candidates[0]!.engine} preferred`
      : `advised ${tier} tier, ${profileFloor} profile floor for ${opts.taskClass} work; no usable engine (nothing installed + keyed for this tier)`

  return { candidates, profile, profileFloor, reason, tier }
}
