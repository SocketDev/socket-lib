/**
 * @file GitHub token resolution. Three sources, in priority order: environment
 *   variables, then `git config github.token`. The combined fallback
 *   (`getGitHubTokenWithFallback`) is what most callers want; the individual
 *   helpers exist so callers can constrain the search (e.g., env-only contexts
 *   where shelling out to git would be wrong).
 */

import { getGhToken, getGithubToken } from '../env/github'
import { getSocketCliGithubToken } from '../env/socket-cli'
import { spawn } from '../process/spawn/child'

import type { SpawnOptions } from '../process/spawn/types'

/**
 * Get GitHub authentication token from environment variables. Checks multiple
 * environment variable names in priority order.
 *
 * Environment variables checked (in order):
 *
 * 1. `GITHUB_TOKEN` - Standard GitHub token variable
 * 2. `GH_TOKEN` - Alternative GitHub CLI token variable
 * 3. `SOCKET_CLI_GITHUB_TOKEN` - Socket-specific token variable
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
  return (
    getGithubToken() || getGhToken() || getSocketCliGithubToken() || undefined
  )
}

/**
 * Get GitHub authentication token from git config. Reads the `github.token`
 * configuration value from git config. This is a fallback method when
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
 * @returns GitHub token from git config, or `undefined` if not configured
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
    // Ignore errors - git config may not have token.
  }
  return undefined
  /* c8 ignore stop */
}

/**
 * Get GitHub authentication token from all available sources. Checks
 * environment variables first, then falls back to git config. This is the
 * recommended way to get a GitHub token with maximum compatibility.
 *
 * Priority order:
 *
 * 1. Environment variables (GITHUB_TOKEN, GH_TOKEN, SOCKET_CLI_GITHUB_TOKEN)
 * 2. Git config (github.token)
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
  return getGitHubToken() || (await getGitHubTokenFromGitConfig())
}
