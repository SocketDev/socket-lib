/**
 * @file Declarative ROLE → (tier, profile) orchestration for AI call-outs. A
 *   caller names the ROLE its spawn plays — discovery, execution, planning,
 *   review, verification — and gets the fleet-policy (model, effort) pair via
 *   `AI_TIER` plus the matching permission `AI_PROFILE`, instead of hardcoding
 *   a model string and hand-pairing a profile at every site.
 *   The policy encodes fleet doctrine (see docs/agents.md/fleet/{token-spend,
 *   delegating-execution,fable-fallback}.md): Fable is the planning/review
 *   brain; execution + verification run on the sonnet floor to save tokens
 *   (mechanical execution drops to haiku); Opus is reserved for
 *   security-sensitive planning/review — never Fable there.
 *   Everything downstream is reuse: `spawnForRole` delegates to
 *   `spawnTierWithFallback`, so the model/effort table (`AI_TIER`), the
 *   availability-gated cross-engine fallback (`route.mts`), and the
 *   Fable-adaptive-only effort omission (`spawn.mts`) stay the single source.
 *   Model + effort can never be mismatched or omitted here — the tier supplies
 *   both, and the profile supplies tools/permission, so a caller cannot drift
 *   them apart.
 */

import { AI_PROFILE } from './profiles.mts'
import { spawnTierWithFallback } from './spawn.mts'
import type { RouteContext } from './route.mts'
import type { TierSpawnResult } from './spawn.mts'
import type { AiTier } from './tier.mts'
import type { SpawnAiAgentOptions } from './types.mts'

export type AiRole =
  | 'discovery'
  | 'execution'
  | 'planning'
  | 'review'
  | 'verification'

export type RoleSensitivity = 'benign' | 'security'

// The two levers that can move a role off its default tier — an options bag,
// not positional args, so a call site never reads as `resolveRoleTier(x, true)`.
export interface RoleTierLevers {
  readonly mechanical?: boolean | undefined
  readonly sensitivity?: RoleSensitivity | undefined
}

export interface RolePolicy {
  readonly tier: AiTier
  // When set, a `security` sensitivity routes to this tier instead of `tier`.
  readonly securityTier?: AiTier | undefined
  readonly profile: keyof typeof AI_PROFILE
}

/**
 * The role → policy table. The one place a role's tier + permission profile
 * live; consumers derive, never re-encode.
 */
export const ROLE_POLICY: Readonly<Record<AiRole, RolePolicy>> = {
  // Research / scan / caller-chain reasoning — read-only, floor tier.
  discovery: { profile: 'read', tier: 'sonnet' },
  // Apply a change — floor tier so execution stays cheap; the `mechanical`
  // lever drops it to haiku. verify profile lets it self-check without landing.
  execution: { profile: 'verify', tier: 'sonnet' },
  // The planning brain — Fable, escalating to Opus for security-sensitive work.
  planning: { profile: 'read', securityTier: 'opus', tier: 'fable' },
  // Review is planning's twin — same brain, same security escalation.
  review: { profile: 'read', securityTier: 'opus', tier: 'fable' },
  // Confirm a result — floor tier, may run code to verify.
  verification: { profile: 'verify', tier: 'sonnet' },
}

/**
 * Resolve the tier a role runs at, applying the two levers: `security`
 * sensitivity escalates to the role's `securityTier` (planning/review → opus),
 * and `mechanical` execution drops to the haiku floor. Pure — no I/O.
 */
export function resolveRoleTier(
  role: AiRole,
  options?: RoleTierLevers | undefined,
): AiTier {
  const opts = { __proto__: null, ...options } as RoleTierLevers
  const policy = ROLE_POLICY[role]
  // Mechanical downgrade applies only to execution — a provably-mechanical
  // edit needs neither the sonnet floor's reasoning nor a smarter tier.
  if (opts.mechanical && role === 'execution') {
    return 'haiku'
  }
  if (opts.sensitivity === 'security' && policy.securityTier !== undefined) {
    return policy.securityTier
  }
  return policy.tier
}

// The caller declares the ROLE; the policy supplies the tier (→ model/effort)
// and the profile (→ tools/allow/disallow/permissionMode). So both axes are
// omitted from the caller's options — passing them would fight the policy.
export interface SpawnForRoleOptions extends Omit<
  SpawnAiAgentOptions,
  | 'agent'
  | 'allow'
  | 'disallow'
  | 'effort'
  | 'model'
  | 'permissionMode'
  | 'tools'
> {
  readonly sensitivity?: RoleSensitivity | undefined
  readonly mechanical?: boolean | undefined
}

/**
 * Spawn an AI call-out by the ROLE it plays. Resolves role → tier (via
 * `resolveRoleTier`) and role → permission profile (via `AI_PROFILE`), then
 * delegates to `spawnTierWithFallback` so model/effort/fallback/Fable handling
 * stay in the canonical tier layer. The caller supplies only prompt/cwd/etc —
 * never a model, effort, or profile.
 */
export function spawnForRole(
  role: AiRole,
  ctx: RouteContext,
  options: SpawnForRoleOptions,
): Promise<TierSpawnResult> {
  const { mechanical, sensitivity, ...rest } = {
    __proto__: null,
    ...options,
  } as SpawnForRoleOptions
  const tier = resolveRoleTier(role, { mechanical, sensitivity })
  const profile = AI_PROFILE[ROLE_POLICY[role].profile]
  return spawnTierWithFallback(tier, ctx, {
    ...profile,
    ...rest,
  })
}
