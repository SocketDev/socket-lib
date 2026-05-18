/**
 * @file Resolve a secret from the canonical fleet precedence order: process env
 *   → OS keychain. Returns the value + the source it came from so the caller
 *   can log which slot won. Why a helper instead of inlining: every consumer of
 *   the fleet's Socket API token does the same dance — check
 *   `process.env.SOCKET_API_TOKEN`, fall back to a legacy env-var alias, fall
 *   back to `readSecret({...})` from the keychain. Tools drift on the exact
 *   order and on which aliases they consider. This helper centralizes the
 *   precedence so a token check in socket-cli, socket-mcp, depot, and ad-hoc
 *   scripts all behave the same way. Not included: `.env` file parsing. Hosts
 *   that want `.env` support should pre-populate `process.env` from `.env`
 *   themselves (e.g. with `dotenv.config()` at process start). Folding `.env`
 *   reads into this helper would couple the secrets API to a config-file parser
 *   that's better lived at the application boundary. Prompt minimization: every
 *   keychain read short-circuits through the process-scoped cache in
 *   `./_internal.ts`. So calling `resolve` multiple times in one process spawns
 *   at most one `security` (macOS) / `secret-tool` (Linux) / `powershell`
 *   (Windows) per `{service, account}` pair. Combined with macOS's `-A -T ''`
 *   ACL (set by `writeSecret`), this means: at most one Keychain auth prompt
 *   across a process's entire lifetime — and zero prompts when the env-var path
 *   covers the read.
 */

import { readSecret, readSecretSync } from './keychain'

export interface ResolveOptions {
  /**
   * Logical service identifier for the keychain lookup. Same value the caller
   * would pass to `writeSecret` / `readSecret`. Ignored when the env-var path
   * resolves the value first.
   */
  service: string
  /**
   * Names to try, in order. Each name is checked as both an env-var
   * (`process.env[name]`) and a keychain account name. Env-var matches always
   * beat keychain matches (env-var is cheaper and doesn't risk a Keychain
   * prompt).
   *
   * Order matters: list the canonical name first so a legacy alias is only
   * consulted when the canonical entry is missing.
   */
  accounts: readonly string[]
  /**
   * When `true`, skip the keychain fallback entirely. The resolver checks
   * `process.env[account]` for each account and returns `undefined` immediately
   * if none match. Use this in headless contexts (CI runners, bootstrap hooks)
   * where a Keychain auth prompt is unacceptable.
   *
   * @default false
   */
  allowEnvOnly?: boolean | undefined
}

export interface ResolveResult {
  value: string
  /**
   * Where the value came from: 'env' — `process.env[<account>]` had a non-empty
   * value. 'keychain' — env-var was empty/missing; the value was read from the
   * OS credential store under the matching account.
   */
  source: 'env' | 'keychain'
  /**
   * Which account in `accounts` was the actual hit.
   */
  account: string
}

/**
 * Pull a non-empty string from `process.env[name]`. Returns `undefined` for
 * missing or empty values so the caller can fall through to the next source
 * without distinguishing the two cases.
 */
export function readEnv(name: string): string | undefined {
  const value = process.env[name]
  if (typeof value !== 'string') {
    return undefined
  }
  const trimmed = value.trim()
  return trimmed ? trimmed : undefined
}

/**
 * Resolve a secret following the canonical env → keychain order. Returns
 * `undefined` when neither source has the value — the caller's signal to prompt
 * the user or surface a setup hint.
 */
export async function resolve(
  opts: ResolveOptions,
): Promise<ResolveResult | undefined> {
  const { accounts, allowEnvOnly, service } = opts
  for (let i = 0, { length } = accounts; i < length; i += 1) {
    const account = accounts[i]!
    const fromEnv = readEnv(account)
    if (fromEnv) {
      return { value: fromEnv, source: 'env', account }
    }
  }
  if (allowEnvOnly) {
    return undefined
  }
  for (let i = 0, { length } = accounts; i < length; i += 1) {
    const account = accounts[i]!
    const fromKeychain = await readSecret({ service, account })
    if (fromKeychain) {
      return { value: fromKeychain, source: 'keychain', account }
    }
  }
  return undefined
}

/**
 * Sync variant for non-async callers (hook initializers, schema validators that
 * run before any `await` machinery exists).
 */
export function resolveSync(opts: ResolveOptions): ResolveResult | undefined {
  const { accounts, allowEnvOnly, service } = opts
  for (let i = 0, { length } = accounts; i < length; i += 1) {
    const account = accounts[i]!
    const fromEnv = readEnv(account)
    if (fromEnv) {
      return { value: fromEnv, source: 'env', account }
    }
  }
  if (allowEnvOnly) {
    return undefined
  }
  for (let i = 0, { length } = accounts; i < length; i += 1) {
    const account = accounts[i]!
    const fromKeychain = readSecretSync({ service, account })
    if (fromKeychain) {
      return { value: fromKeychain, source: 'keychain', account }
    }
  }
  return undefined
}
