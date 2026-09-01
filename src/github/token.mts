/**
 * @file GitHub token resolution. Three sources, in priority order: environment
 *   variables, `git config github.token`, then the `gh` CLI's own credential.
 *   The combined fallback (`getGitHubTokenWithFallback`) is what most callers
 *   want; the individual helpers exist so callers can constrain the search
 *   (e.g., env-only contexts where shelling out would be wrong). The `gh` step
 *   is last but it is the one that fires most often on a developer machine,
 *   because `gh auth login` stores its token in the OS KEYCHAIN. No environment
 *   variable and no `git config` entry is written, so a resolver that stops
 *   before this step reports "no token" on a machine that is fully
 *   authenticated. The cost is a SILENT downgrade rather than an error: GitHub
 *   serves anonymous requests at 60/hour against 5000, so a sweep succeeds for
 *   its first few calls and then fails in a way that reads as a network
 *   problem. See `github/rate-limit` for making that visible.
 */

import { getGhToken, getGithubToken } from '../env/github.mjs'
import { spawn } from '../process/spawn/child.mjs'

import type { SpawnOptions } from '../process/spawn/types.mjs'

// Memoized as the PROMISE, not the resolved value, so concurrent callers share
// one resolution instead of each spawning its own subprocess.
let cachedToken: Promise<string | undefined> | undefined

/**
 * Drop the memo held by {@link resolveGitHubToken}. For tests, which vary the
 * environment between cases, and for a process that changes credentials.
 *
 * @example
 *   ;```ts
 *   clearGitHubTokenCache()
 *   ```
 */
export function clearGitHubTokenCache(): void {
  cachedToken = undefined
}

/**
 * Get GitHub authentication token from environment variables. Checks multiple
 * environment variable names in priority order.
 *
 * Environment variables checked, in order:
 *
 * 1. `GITHUB_TOKEN` - Standard GitHub token variable
 * 2. `GH_TOKEN` - Alternative GitHub CLI token variable
 *
 * The Socket-CLI-specific `SOCKET_CLI_GITHUB_TOKEN` is intentionally NOT read
 * here — that variable is the CLI's concern (`getSocketCliGithubToken`), so
 * this generic resolver stays limited to the standard GitHub token names.
 *
 * @example
 *   ;```ts
 *   const token = getGitHubToken()
 *   if (!token) {
 *     console.warn('No GitHub token found')
 *   }
 *   ```
 *
 * @returns The first available GitHub token, or `undefined` if none found
 */
export function getGitHubToken(): string | undefined {
  return getGithubToken() || getGhToken() || undefined
}

/**
 * Get GitHub authentication token from the `gh` CLI. Runs `gh auth token`,
 * which prints the credential `gh auth login` stored.
 *
 * This reaches tokens no other resolver here can see. `gh` keeps its
 * credential in the OS keychain by default, and it also holds SSO-authorized
 * tokens that a plain environment variable would not carry. On a developer
 * machine this is usually the ONLY source that answers.
 *
 * Returns `undefined` when `gh` is absent, not logged in, or slow enough to hit
 * the timeout, so the caller degrades to an unauthenticated request rather than
 * failing outright.
 *
 * @example
 *   ;```ts
 *   const token = await getGitHubTokenFromGhCli()
 *   ```
 *
 * @param options - Spawn options for the `gh` command execution.
 *
 * @returns GitHub token from `gh`, or `undefined` when it has none.
 */
export async function getGitHubTokenFromGhCli(
  options?: SpawnOptions | undefined,
): Promise<string | undefined> {
  /* c8 ignore start - External gh process call */
  try {
    const result = await spawn('gh', ['auth', 'token'], {
      ...options,
      stdio: 'pipe',
    })
    if (result.code === 0 && result.stdout) {
      return result.stdout.toString().trim() || undefined
    }
  } catch {
    // gh absent, or not logged in. Not an error: the caller degrades to an
    // unauthenticated request.
  }
  return undefined
  /* c8 ignore stop */
}

/**
 * Get GitHub authentication token from `git config`. Reads the `github.token`
 * configuration value from `git config`. This is a fallback method when
 * environment variables don't contain a token.
 *
 * @example
 *   ;```ts
 *   const token = await getGitHubTokenFromGitConfig()
 *   if (token) {
 *     console.log('Found token in git config')
 *   }
 *   ```
 *
 * @example
 *   ;```ts
 *   // With custom working directory
 *   const token = await getGitHubTokenFromGitConfig({
 *     cwd: '/path/to/repo',
 *   })
 *   ```
 *
 * @param options - Spawn options for git command execution.
 *
 * @returns GitHub token from `git config`, or `undefined` if not configured
 */
export async function getGitHubTokenFromGitConfig(
  options?: SpawnOptions | undefined,
): Promise<string | undefined> {
  /* c8 ignore start - External git process call */
  try {
    const result = await spawn('git', ['config', 'github.token'], {
      ...options,
      stdio: 'pipe',
    })
    if (result.code === 0 && result.stdout) {
      return result.stdout.toString().trim()
    }
  } catch {
    // Ignore errors - `git config` may not have token.
  }
  return undefined
  /* c8 ignore stop */
}

/**
 * Get GitHub authentication token from all available sources. Checks
 * environment variables, then `git config`, then the `gh` CLI. This is the
 * recommended way to get a GitHub token with maximum compatibility.
 *
 * Priority order:
 *
 * 1. Environment variables (GITHUB_TOKEN, GH_TOKEN)
 * 2. Git config (github.token)
 * 3. The `gh` CLI (`gh auth token`)
 *
 * Env and `git config` come first because they are cheap and explicit: a caller
 * that sets `GITHUB_TOKEN` means that token, and CI sets it. `gh` is last
 * because it costs a subprocess, and it is present because it is the source
 * that actually holds the credential on a developer machine.
 *
 * @example
 *   ;```ts
 *   const token = await getGitHubTokenWithFallback()
 *   if (!token) {
 *     throw new ErrorCtor('GitHub token required')
 *   }
 *   ```
 *
 * @returns GitHub token from first available source, or `undefined` if none
 *   found.
 */
export async function getGitHubTokenWithFallback(): Promise<
  string | undefined
> {
  return (
    getGitHubToken() ||
    (await getGitHubTokenFromGitConfig()) ||
    (await getGitHubTokenFromGhCli())
  )
}

/**
 * The GitHub token, resolved once per process.
 *
 * Same sources and same order as {@link getGitHubTokenWithFallback}, memoized.
 * This is what a per-request code path should call: the fallback chain spawns
 * up to two subprocesses when the environment carries no token, and paying
 * that on every request in a loop over repos costs more than the request it
 * authenticates.
 *
 * The tradeoff is that a token appearing in the environment LATER is not seen.
 * That suits a process resolving its own credential once and not a long-lived
 * service switching identities, which should call
 * {@link getGitHubTokenWithFallback} directly or clear the cache.
 *
 * @example
 *   ;```ts
 *   const token = await resolveGitHubToken()
 *   ```
 *
 * @returns GitHub token from the first available source, or `undefined`.
 */
export async function resolveGitHubToken(): Promise<string | undefined> {
  cachedToken ??= getGitHubTokenWithFallback()
  return await cachedToken
}
