/**
 * @fileoverview Authenticated GitHub REST fetch.
 *
 * `fetchGitHub` is the single entry point that the rest of the
 * github/ modules go through for REST calls. It handles four things
 * the callers shouldn't have to repeat:
 *
 *   1. Token resolution (env → git config) when the caller doesn't
 *      pass an explicit token.
 *   2. Standard headers (Accept, User-Agent) merged with caller-
 *      supplied headers.
 *   3. Rate-limit detection — when GitHub returns 403 with
 *      `x-ratelimit-remaining: 0`, throw a typed `GitHubRateLimitError`
 *      so callers can react (set GITHUB_TOKEN, retry after reset).
 *   4. Empty-body detection — 200 OK + zero-byte body is the
 *      documented incident shape (see GitHubEmptyBodyError JSDoc).
 *      Raised as a typed error so the ref / GHSA modules can fall
 *      back to GraphQL on a different backend.
 *
 * `getGhsaUrl` lives here because it's the URL counterpart to the
 * GHSA fetch path — the only other consumer is the GHSA module.
 */

import { errorMessage } from '../errors'
import { httpRequest } from '../http-request/request'
import { DateCtor } from '../primordials/date'
import { ErrorCtor } from '../primordials/error'
import { JSONParse } from '../primordials/json'
import { getGitHubToken } from './token'
import { GitHubEmptyBodyError } from './types'

import type { GitHubFetchOptions, GitHubRateLimitError } from './types'

/**
 * Fetch data from GitHub API with automatic authentication and rate limit handling.
 * Makes authenticated requests to the GitHub REST API with proper error handling.
 *
 * Features:
 * - Automatic token injection from environment if not provided
 * - Rate limit detection with helpful error messages
 * - Standard GitHub API headers (Accept, User-Agent)
 * - JSON response parsing
 *
 * @template T - Expected response type (defaults to `unknown`)
 * @param url - Full GitHub API URL (e.g., 'https://api.github.com/repos/owner/repo')
 * @param options - Fetch options including token and custom headers
 * @returns Parsed JSON response of type `T`
 *
 * @throws {GitHubRateLimitError} When API rate limit is exceeded (status 403)
 * @throws {Error} For other API errors with status code and message
 *
 * @example
 * ```ts
 * // Fetch repository information
 * interface Repo {
 *   name: string
 *   full_name: string
 *   default_branch: string
 * }
 * const repo = await fetchGitHub<Repo>(
 *   'https://api.github.com/repos/owner/repo'
 * )
 * console.log(`Default branch: ${repo.default_branch}`)
 * ```
 *
 * @example
 * ```ts
 * // With custom token and headers
 * const data = await fetchGitHub(
 *   'https://api.github.com/user',
 *   {
 *     token: 'ghp_customtoken',
 *     headers: { 'X-Custom-Header': 'value' }
 *   }
 * )
 * ```
 *
 * @example
 * ```ts
 * // Handle rate limit errors
 * try {
 *   await fetchGitHub('https://api.github.com/repos/owner/repo')
 * } catch (e) {
 *   if (e.status === 403 && e.resetTime) {
 *     console.error(`Rate limited until ${e.resetTime}`)
 *   }
 * }
 * ```
 */
export async function fetchGitHub<T = unknown>(
  url: string,
  options?: GitHubFetchOptions | undefined,
): Promise<T> {
  const opts = { __proto__: null, ...options } as GitHubFetchOptions
  const token = opts.token || getGitHubToken()

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'socket-registry-github-client',
    ...opts.headers,
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  /* c8 ignore start - External GitHub API call */
  const response = await httpRequest(url, { headers })
  /* c8 ignore stop */

  if (!response.ok) {
    if (response.status === 403) {
      const rateLimit = response.headers['x-ratelimit-remaining']
      const rateLimitStr =
        typeof rateLimit === 'string' ? rateLimit : rateLimit?.[0]
      if (rateLimitStr === '0') {
        const resetTime = response.headers['x-ratelimit-reset']
        const resetTimeStr =
          typeof resetTime === 'string' ? resetTime : resetTime?.[0]
        const resetDate = resetTimeStr
          ? new DateCtor(Number(resetTimeStr) * 1000)
          : undefined
        const error = new ErrorCtor(
          `GitHub API rate limit exceeded${resetDate ? `. Resets at ${resetDate.toLocaleString()}` : ''}. Use GITHUB_TOKEN environment variable to increase rate limit.`,
        ) as GitHubRateLimitError
        error.status = 403
        error.resetTime = resetDate
        throw error
      }
    }
    throw new ErrorCtor(
      `GitHub API error ${response.status}: ${response.statusText}`,
    )
  }

  // 200 OK + zero-byte body is the documented GitHub incident shape
  // (Elasticsearch degraded → REST GETs return successful empty
  // responses). Surface as a typed error so callers can fall back to
  // GraphQL rather than parsing '' and throwing a confusing
  // SyntaxError. Without this guard `JSON.parse('')` blows up with
  // an unrelated "Unexpected end of JSON input" message that hides
  // the upstream cause.
  if (response.body.byteLength === 0) {
    throw new GitHubEmptyBodyError(url)
  }

  try {
    return JSONParse(response.body.toString('utf8')) as T
  } catch (e) {
    throw new ErrorCtor(
      `Failed to parse GitHub API response: ${errorMessage(e)}\n` +
        `URL: ${url}\n` +
        'Response may be malformed or incomplete.',
      { cause: e },
    )
  }
}

/**
 * Generate GitHub Security Advisory URL from GHSA ID.
 * Constructs the public advisory URL for a given GHSA identifier.
 *
 * @param ghsaId - GHSA identifier (e.g., 'GHSA-xxxx-yyyy-zzzz')
 * @returns Full URL to the advisory page
 *
 * @example
 * ```ts
 * const url = getGhsaUrl('GHSA-1234-5678-90ab')
 * console.log(url) // 'https://github.com/advisories/GHSA-1234-5678-90ab'
 * ```
 */
export function getGhsaUrl(ghsaId: string): string {
  return `https://github.com/advisories/${ghsaId}`
}
