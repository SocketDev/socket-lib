/**
 * @file GitHub API authentication header helpers for the release helpers.
 *   Two resolvers, and the difference matters. The env-only one is for a sync
 *   call site; anything that can await should take the full chain, because a
 *   developer machine's credential usually lives in the `gh` keychain where no
 *   environment variable can see it. A request that goes out unauthenticated is
 *   served 60/hour instead of 5000 and GitHub does not announce the downgrade,
 *   so a release sweep fails partway through in a way that reads as a network
 *   fault.
 */

import process from 'node:process'

import { resolveGitHubToken } from '../github/token.mjs'

/**
 * The `Accept` and API-version headers every GitHub REST call should carry.
 */
export function baseHeaders(): Record<string, string> {
  return {
    Accept: 'application/vnd.github+json',
    'X-GitHub-Api-Version': '2022-11-28',
  }
}

/**
 * Get GitHub authentication headers from the environment only. Checks GH_TOKEN
 * or GITHUB_TOKEN.
 *
 * Prefer {@link getAuthHeadersWithFallback} wherever the call site can await:
 * this one cannot see a token held by `gh` or `git config`, so it reports "no
 * credential" on a machine that has one.
 *
 * @example
 *   ;```typescript
 *   const headers = getAuthHeaders()
 *   // { Accept: 'application/vnd.github+json', Authorization: 'Bearer ...' }
 *   ```
 *
 * @returns Headers object with Authorization header if a token is in the env.
 */
export function getAuthHeaders(): Record<string, string> {
  const token = process.env['GH_TOKEN'] || process.env['GITHUB_TOKEN']
  const headers = baseHeaders()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}

/**
 * Get GitHub authentication headers, resolving the token from every source:
 * environment, `git config`, then the `gh` CLI.
 *
 * @example
 *   ;```typescript
 *   const headers = await getAuthHeadersWithFallback()
 *   ```
 *
 * @returns Headers object with Authorization header if any source has a token.
 */
export async function getAuthHeadersWithFallback(): Promise<
  Record<string, string>
> {
  const token = await resolveGitHubToken()
  const headers = baseHeaders()
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  return headers
}
