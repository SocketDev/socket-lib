/**
 * @file Layered provider-credential resolver for AI backends. One call site,
 *   dev and CI: a provider token resolves from an explicit override, then the
 *   provider's env var, then the OS keychain — mirroring the
 *   `readSocketApiToken` env → keychain precedence
 *   (`secrets/socket-api-token.ts`). Why a single resolver: `ai/http.mts` read
 *   `process.env[tokenEnv]` inline, so every consumer hard-coded the env-only
 *   path and none could reach the keychain. Routing skills also need a uniform
 *   way to ask "do I have a credential for provider X?" without knowing its
 *   env-var name. This centralizes the provider → { tokenEnv, keychainService }
 *   map (the HTTP providers reuse `AI_HTTP_PROVIDERS` so the env var isn't
 *   duplicated) and the precedence. CI vs dev: pass `allowEnvOnly: true` (the
 *   resolver's existing escape) in headless contexts so a missing token returns
 *   `undefined` immediately instead of triggering a keychain auth prompt. CI
 *   sets the token as a GH-secret env var (e.g. `ANTHROPIC_API_KEY`); the same
 *   `resolveProviderCredential` call reads it there with no keychain. proteus
 *   hook-point: the forthcoming biometric credential daemon
 *   (`.claude/plans/proteus-credential-broker.md`) slots in as a layer between
 *   the env check and the keychain read inside `resolve()`'s implementation —
 *   call sites here do not change when it lands (resolver decision #4 in that
 *   plan). This module is the stable seam.
 */

import { resolve } from '../secrets/find'

/**
 * A provider whose credential this module can resolve: the HTTP providers
 * (fireworks, synthetic) plus the CLI/first-party providers (anthropic, openai,
 * xai) for CI env + keychain.
 */
export type CredentialProvider =
  | 'anthropic'
  | 'fireworks'
  | 'openai'
  | 'synthetic'
  | 'xai'

export interface ProviderCredentialSpec {
  // The env var the token lives in (CI sets this as a secret).
  readonly tokenEnv: string
  // The OS-keychain service name for the dev-machine keychain entry.
  readonly keychainService: string
}

// Single source of truth for provider → { tokenEnv, keychainService }. The
// fireworks/synthetic tokenEnv values MUST match `AI_HTTP_PROVIDERS` in
// `ai/http.mts` (a check keeps them in sync rather than an import — importing
// the runtime const here would create an http ↔ credentials cycle). The
// keychain service is the fleet-uniform `socketsecurity` scope (the daemon /
// keychain stores per-account, account == tokenEnv).
export const PROVIDER_CREDENTIALS: Readonly<
  Record<CredentialProvider, ProviderCredentialSpec>
> = {
  __proto__: null,
  anthropic: {
    keychainService: 'socketsecurity',
    tokenEnv: 'ANTHROPIC_API_KEY',
  },
  fireworks: {
    keychainService: 'socketsecurity',
    tokenEnv: 'FIREWORKS_API_KEY',
  },
  openai: { keychainService: 'socketsecurity', tokenEnv: 'OPENAI_API_KEY' },
  synthetic: {
    keychainService: 'socketsecurity',
    tokenEnv: 'SYNTHETIC_API_KEY',
  },
  xai: { keychainService: 'socketsecurity', tokenEnv: 'XAI_API_KEY' },
} as unknown as Readonly<Record<CredentialProvider, ProviderCredentialSpec>>

/**
 * True when `value` names a provider with a resolvable credential.
 */
export function isCredentialProvider(
  value: string,
): value is CredentialProvider {
  return value in PROVIDER_CREDENTIALS
}

export interface ResolveProviderCredentialOptions {
  // The provider whose token to resolve.
  readonly provider: CredentialProvider
  // An explicit token that wins over every other source (e.g. a value the
  // caller already holds). Skips env + keychain entirely when set.
  readonly explicit?: string | undefined
  // Skip the keychain fallback — env var only. Use in headless contexts (CI,
  // bootstrap hooks) where a keychain auth prompt is unacceptable.
  readonly allowEnvOnly?: boolean | undefined
}

/**
 * Resolve a provider's bearer token: explicit override → env var → keychain →
 * undefined. The token never appears inline or in logs — callers pass the
 * result straight to an `Authorization` header. Returns `undefined` when no
 * source has it (the caller decides whether that's fatal).
 */
export async function resolveProviderCredential(
  options: ResolveProviderCredentialOptions,
): Promise<string | undefined> {
  const opts = { __proto__: null, ...options } as typeof options
  if (opts.explicit) {
    return opts.explicit
  }
  const spec = PROVIDER_CREDENTIALS[opts.provider]
  if (!spec) {
    return undefined
  }
  // `resolve` checks each account as an env var first, then the keychain
  // (service + account), honoring allowEnvOnly. The account IS the env-var
  // name, matching the readSocketApiToken convention. The proteus daemon will
  // insert its biometric layer inside `resolve()` without changing this call.
  const result = await resolve({
    accounts: [spec.tokenEnv],
    allowEnvOnly: opts.allowEnvOnly,
    service: spec.keychainService,
  })
  return result?.value
}
