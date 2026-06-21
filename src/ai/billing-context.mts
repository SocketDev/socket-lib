/**
 * @file Build a `BillingContext` for the route-heuristic WITHOUT privileged
 *   lookups. A normal user has no Admin key (`sk-ant-admin01-`), so we cannot
 *   read org spend / quota — the Anthropic Cost API is admin-gated — and that
 *   is an accepted limitation, not something to engineer around. So this layer
 *   does NO network call and NO privileged probe. It uses only what a user
 *   actually has: which provider credentials resolve (the same env → keychain
 *   check that builds `RouteContext.keyed`, non-admin), tags each with its
 *   INHERENT billing kind (a metered API, a flat-rate plan, a subscription seat
 *   — the provider's nature, overridable by config), and leaves `headroom`
 *   undefined. Undefined headroom means the heuristic routes REACTIVELY: it
 *   falls over on a 429 / quota error at spawn time (`isQuotaExhausted` in
 *   `spawn.mts`), rather than predicting a cap it has no privilege to read. A
 *   caller that DOES have a non-privileged quota endpoint (e.g. Synthetic
 *   `/v2/quotas` with the ordinary key) may pass best-effort `headroom` in —
 *   but nothing here requires it, and no privileged reader is built or wired.
 */

import { ObjectKeys } from '../primordials/object'
import { getEnvValue } from '../env/rewire'
import {
  PROVIDER_CREDENTIALS,
  resolveProviderCredential,
} from './credentials.mts'

import type { CredentialProvider } from './credentials.mts'
import type {
  BillingAccount,
  BillingContext,
  BillingHeadroom,
  BillingKind,
  RoutingEnv,
} from './route-heuristic.mts'

/**
 * Inherent billing model per provider — the provider's NATURE, not anyone's
 * account or limit. A metered pay-per-token API (`anthropic` with an API key,
 * `fireworks`, `xai`), a flat-rate plan (`synthetic`), or a subscription seat
 * (`openai` via a ChatGPT/Codex seat). These are DEFAULTS only: a caller
 * overrides per provider via the `kinds` option — e.g. a user whose Anthropic
 * access is a Claude Max seat (no API key) marks `anthropic` as `subscription`.
 * No dollar figures here; only the kind, which decides dollars-vs-headroom.
 */
export const DEFAULT_PROVIDER_KIND: Readonly<
  Record<CredentialProvider, BillingKind>
> = {
  __proto__: null,
  anthropic: 'metered',
  fireworks: 'metered',
  openai: 'subscription',
  synthetic: 'flat-rate',
  xai: 'metered',
} as unknown as Readonly<Record<CredentialProvider, BillingKind>>

export interface BillingFromKeyedOptions {
  // The providers with a resolvable credential — reuse the set already built
  // for `RouteContext.keyed` so no extra probing happens here.
  readonly keyed: ReadonlySet<CredentialProvider>
  // Per-provider kind overrides (config); merged over DEFAULT_PROVIDER_KIND.
  readonly kinds?:
    | Readonly<Partial<Record<CredentialProvider, BillingKind>>>
    | undefined
  // Optional best-effort headroom a caller read from a NON-privileged endpoint
  // (e.g. Synthetic /v2/quotas). Omit for the reactive default.
  readonly headroom?:
    | Readonly<Partial<Record<CredentialProvider, BillingHeadroom>>>
    | undefined
}

/**
 * Turn an already-probed set of keyed providers into a `BillingContext`,
 * tagging each with its kind (config override → inherent default) and any
 * caller-supplied best-effort headroom. Pure: no I/O, no privileged lookup. A
 * provider with no known kind is skipped rather than given an undefined kind.
 */
export function billingFromKeyed(
  options: BillingFromKeyedOptions,
): BillingContext {
  const opts = { __proto__: null, ...options } as BillingFromKeyedOptions
  const out = { __proto__: null } as unknown as Record<
    CredentialProvider,
    BillingAccount
  >
  for (const provider of opts.keyed) {
    const kind = opts.kinds?.[provider] ?? DEFAULT_PROVIDER_KIND[provider]
    if (!kind) {
      continue
    }
    const headroom = opts.headroom?.[provider]
    out[provider] = headroom ? { headroom, kind, provider } : { kind, provider }
  }
  return out
}

/**
 * Detect whether routing runs in locked-down CI (restricted to the secrets
 * actually present, under the four-flag lockdown) or local dev (full freedom).
 * CI when the standard `CI` env var is set; `local` otherwise.
 */
export function detectRoutingEnv(): RoutingEnv {
  return getEnvValue('CI') ? 'ci' : 'local'
}

export interface DiscoverBillingOptions {
  // Skip the keychain fallback when probing credentials (env var only). Defaults
  // to true in CI, false locally. Set true to guarantee no keychain access.
  readonly allowEnvOnly?: boolean | undefined
  // Where routing runs; defaults to `detectRoutingEnv()`.
  readonly env?: RoutingEnv | undefined
  // Optional best-effort headroom (non-privileged readers only).
  readonly headroom?:
    | Readonly<Partial<Record<CredentialProvider, BillingHeadroom>>>
    | undefined
  // Per-provider kind overrides (config).
  readonly kinds?:
    | Readonly<Partial<Record<CredentialProvider, BillingKind>>>
    | undefined
}

/**
 * Discover a `BillingContext` end-to-end with no privileged lookup: probe which
 * provider credentials resolve (env → keychain, the non-admin check), then tag
 * them via `billingFromKeyed`. Headroom defaults to undefined (reactive). In CI
 * the credential probe is env-only (no keychain prompt); locally it allows the
 * keychain. Convenience over calling `discoverKeyedProviders` +
 * `billingFromKeyed`.
 */
export async function discoverBilling(
  options?: DiscoverBillingOptions | undefined,
): Promise<BillingContext> {
  const opts = { __proto__: null, ...options } as DiscoverBillingOptions
  const env = opts.env ?? detectRoutingEnv()
  const keyed = await discoverKeyedProviders({
    allowEnvOnly: opts.allowEnvOnly ?? env === 'ci',
  })
  return billingFromKeyed({
    headroom: opts.headroom,
    keyed,
    kinds: opts.kinds,
  })
}

export interface DiscoverKeyedProvidersOptions {
  // Env var only — no keychain fallback (avoids a prompt). Default false.
  readonly allowEnvOnly?: boolean | undefined
}

/**
 * The set of providers with a resolvable credential, probed via the same
 * non-admin env → keychain resolver `RouteContext.keyed` uses. No network, no
 * privilege. Pass `allowEnvOnly: true` in headless contexts to skip the
 * keychain entirely.
 */
export async function discoverKeyedProviders(
  options?: DiscoverKeyedProvidersOptions | undefined,
): Promise<Set<CredentialProvider>> {
  const opts = { __proto__: null, ...options } as DiscoverKeyedProvidersOptions
  const providers = ObjectKeys(PROVIDER_CREDENTIALS) as CredentialProvider[]
  const keyed = new Set<CredentialProvider>()
  for (let i = 0, { length } = providers; i < length; i += 1) {
    const provider = providers[i]!
    // Sequential probes (a handful of providers): avoids a burst of concurrent
    // keychain access that could stack auth prompts.
    const token = await resolveProviderCredential({
      allowEnvOnly: opts.allowEnvOnly,
      provider,
    })
    if (token) {
      keyed.add(provider)
    }
  }
  return keyed
}
