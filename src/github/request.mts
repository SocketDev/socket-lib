/**
 * @file Authenticated GitHub REST fetch. `fetchGitHub` is the single entry
 *   point that the rest of the github/ modules go through for REST calls. It
 *   handles five things the callers shouldn't have to repeat:
 *
 *   1. Token resolution (env → git config → `gh`, memoized) when the caller
 *      doesn't pass an explicit token. `gh` is in the chain because it holds
 *      the keychain-stored credential that no environment variable carries, and
 *      a request that silently goes out anonymous is served 60 requests an hour
 *      rather than 5000.
 *   2. Standard `Accept` and `User-Agent` headers merged with caller-supplied
 *      headers.
 *   3. Rate-limit detection, delegated to `github/error-classification` so all of
 *      its shapes are caught: a 403 with `x-ratelimit-remaining: 0`, a 403
 *      whose body names the limit, a 429, and the secondary limit. Raised as a
 *      typed `GitHubRateLimitError`, and it names an unauthenticated request as
 *      the cause when that is what it was.
 *   4. Budget recording — every response's rate-limit headers go to
 *      `github/rate-limit`, so a later preflight can refuse a sweep before it
 *      starts instead of failing partway through.
 *   5. Empty-body detection — 200 OK + zero-byte body is the documented incident
 *      shape (see GitHubEmptyBodyError JSDoc). Raised as a typed error so the
 *      ref / GHSA modules can fall back to GraphQL on a different backend.
 *      `getGhsaUrl` lives here because it's the URL counterpart to the GHSA
 *      fetch path — the only other consumer is the GHSA module.
 */

import { errorMessage } from '../errors/message.mjs'
import { probeGitHubStatus } from '../env/github-status.mjs'
// oxlint-disable-next-line socket/no-platform-specific-import -- node-only module; http-request/request is the correct internal path.
import { httpRequest } from '../http-request/request.mjs'
import { DateCtor, DateNow } from '../primordials/date.mjs'
import { ErrorCtor } from '../primordials/error.mjs'
import { JSONParse } from '../primordials/json.mjs'
import { classifyGitHubErrorResponse } from './error-classification.mjs'
import {
  classifyGitHubCredentialTier,
  getGitHubRateLimitSnapshot,
  recordGitHubRateLimit,
} from './rate-limit.mjs'
import { resolveGitHubToken } from './token.mjs'
import { GitHubEmptyBodyError } from './errors.mjs'

import type { GitHubStatusResult } from '../env/github-status.mjs'
import type { GitHubFetchOptions, GitHubRateLimitError } from './types.mjs'

/**
 * How long the status probe may take. Short on purpose: the request it explains
 * has already failed, so this is added latency on an error path, and the probe
 * fails open when it runs out.
 */
export const GITHUB_STATUS_PROBE_TIMEOUT_MS = 4000

/**
 * Fetch data from GitHub API with automatic authentication and rate limit
 * handling. Makes authenticated requests to the GitHub REST API with proper
 * error handling.
 *
 * Features: - Automatic token injection from environment if not provided - Rate
 * limit detection with helpful error messages - Standard GitHub API `Accept`
 * and `User-Agent` headers - JSON response parsing.
 *
 * @example
 *   ```ts
 *   // Fetch repository information
 *   interface Repo {
 *   name: string
 *   full_name: string
 *   default_branch: string
 *   }
 *   const repo = await fetchGitHub<Repo>(
 *   'https://api.github.com/repos/owner/repo',
 *   )
 *   console.log(`Default branch: ${repo.default_branch}`)
 *   ```
 *
 * @example
 *   ;```ts
 *   // With custom token and headers
 *   const data = await fetchGitHub('https://api.github.com/user', {
 *     token: 'ghp_customtoken',
 *     headers: { 'X-Custom-Header': 'value' },
 *   })
 *   ```
 *
 * @example
 *   ```ts
 *   // Handle rate limit errors
 *   try {
 *   await fetchGitHub('https://api.github.com/repos/owner/repo')
 *   } catch (e) {
 *   if (e.status === 403 && e.resetTime) {
 *   console.error(`Rate limited until ${e.resetTime}`)
 *   }
 *   }
 *   ```
 *
 * @template T - Expected response type (defaults to `unknown`)
 *
 * @param url - Full GitHub API URL (e.g.,
 *   'https://api.github.com/repos/owner/repo')
 * @param options - Fetch options including token and custom headers.
 *
 * @returns Parsed JSON response of type `T`
 *
 * @throws {GitHubRateLimitError} When API rate limit is exceeded (status 403)
 * @throws {Error} For other API errors with status code and message
 */
export async function fetchGitHub<T = unknown>(
  url: string,
  options?: GitHubFetchOptions | undefined,
): Promise<T> {
  const opts = { __proto__: null, ...options } as GitHubFetchOptions
  // The memoized resolver, so the full chain (env, git config, `gh`) is
  // reachable without paying a subprocess per request. Without `gh` in the
  // chain a developer machine whose only credential is in the OS keychain
  // sends every request anonymously.
  const token = opts.token ?? (await resolveGitHubToken())
  // Injectable so a test exercises the enriched error without reaching
  // githubstatus.com, and so a caller that already knows the platform state
  // can supply it rather than paying for a second lookup.
  const probe = opts.probeStatus ?? probeGitHubStatus

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github.v3+json',
    'User-Agent': 'socket-registry-github-client',
    ...opts.headers,
  }

  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }

  // A timeout, a reset connection, or a DNS failure never reaches the status
  // branches below, because it throws before there is a response to inspect.
  // That is precisely the shape a platform outage takes: the 2026-08-06 Actions
  // incident produced timeouts and dropped runners, not 5xx bodies. So the same
  // probe runs here, and the operator learns whether GitHub was down instead of
  // reading a bare ECONNRESET.
  let response
  try {
    /* c8 ignore start - External GitHub API call */
    response = await httpRequest(url, {
      headers,
      ...(opts.timeout === undefined ? {} : { timeout: opts.timeout }),
    })
    /* c8 ignore stop */
    // Recorded on EVERY response, including successful ones. The budget on a
    // success is what lets a later preflight refuse a sweep before it starts;
    // recording only failures leaves the ledger empty until something has
    // already gone wrong.
    recordGitHubRateLimit(response.headers)
  } catch (e) {
    /* c8 ignore start - External status probe, non-deterministic */
    const ghStatus = await probe(GITHUB_STATUS_PROBE_TIMEOUT_MS).catch(
      () => undefined,
    )
    /* c8 ignore stop */
    throw new ErrorCtor(
      `GitHub API request failed: ${errorMessage(e)}.${formatGitHubStatusNote(ghStatus)}`,
      // The original is preserved as the cause, so a caller inspecting `code`
      // for ECONNRESET or ETIMEDOUT still can.
      { cause: e },
    )
  }

  if (!response.ok) {
    // A rate limit arrives in four shapes: a 403 with
    // `x-ratelimit-remaining: 0`, a 403 whose body says "rate limit" while the
    // header says nothing, a 429, and the secondary limit, which announces
    // itself in the body and sends `Retry-After` instead of a reset timestamp.
    const blocked = classifyGitHubErrorResponse({
      body: response.body.toString('utf8'),
      headers: response.headers,
      status: response.status,
    })
    if (blocked && blocked.kind !== 'auth-failure') {
      const waitSeconds = blocked.waitSeconds
      const resetDate =
        waitSeconds === undefined
          ? undefined
          : new DateCtor(DateNow() + waitSeconds * 1000)
      const tier = classifyGitHubCredentialTier(getGitHubRateLimitSnapshot())
      const error = new ErrorCtor(
        `GitHub API rate limit exceeded${
          resetDate ? `. Resets at ${resetDate.toLocaleString()}` : ''
        }.${
          tier === 'anonymous'
            ? ' This request went out UNAUTHENTICATED (60/hour); set GITHUB_TOKEN or run `gh auth login` for 5000/hour.'
            : ''
        }`,
      ) as GitHubRateLimitError
      error.status = response.status
      error.resetTime = resetDate
      throw error
    }
    // For 5xx responses probe githubstatus.com so the error message tells
    // the caller whether it's a GitHub-side outage or something local.
    if (response.status >= 500) {
      /* c8 ignore start - External status probe, non-deterministic */
      const ghStatus = await probe(GITHUB_STATUS_PROBE_TIMEOUT_MS).catch(
        () => undefined,
      )
      /* c8 ignore stop */
      throw new ErrorCtor(
        `GitHub API error ${response.status}: ${response.statusText}.${formatGitHubStatusNote(ghStatus)}`,
      )
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
 * The sentence appended to a GitHub failure describing the platform's state.
 *
 * Three outcomes, because they call for three different next moves. A degraded
 * component means waiting is the answer. All-operational means the fault is
 * probably this request rather than GitHub, which is what stops someone
 * waiting out an outage that is not happening. An unreachable status page says
 * so plainly instead of implying health it never confirmed.
 *
 * Pure over the probe's result, so every branch is testable without network.
 */
export function formatGitHubStatusNote(
  health: GitHubStatusResult | undefined,
): string {
  if (!health) {
    return ''
  }
  if (health.status === 'unknown') {
    return ' (githubstatus.com unreachable — could not confirm platform health)'
  }
  if (health.degraded) {
    const componentLines = health.components
      .map(c => `  ${c.name}: ${c.status}`)
      .join('\n')
    return `\nGitHub platform status at time of failure:\n${componentLines}`
  }
  return '\nGitHub platform status: all monitored components operational — this may be a transient issue or a request-specific error.'
}

/**
 * Generate GitHub Security Advisory URL from GHSA ID. Constructs the public
 * advisory URL for a given GHSA identifier.
 *
 * @example
 *   ;```ts
 *   const url = getGhsaUrl('GHSA-1234-5678-90ab')
 *   console.log(url) // 'https://github.com/advisories/GHSA-1234-5678-90ab'
 *   ```
 *
 * @param ghsaId - GHSA identifier (e.g., 'GHSA-xxxx-yyyy-zzzz')
 *
 * @returns Full URL to the advisory page
 */
export function getGhsaUrl(ghsaId: string): string {
  return `https://github.com/advisories/${ghsaId}`
}
