/**
 * @file GitHub rate-limit budget tracking, preflight, and reset-aware waiting.
 *   The premise: EVERY GitHub API response already carries the whole budget in
 *   its headers (`x-ratelimit-limit`, `-remaining`, `-reset`, `-used`,
 *   `-resource`). A caller that reads them learns its quota for free, with no
 *   extra request, so nothing here needs to poll `/rate_limit` to know where it
 *   stands. `recordGitHubRateLimit` is meant to be called on every response,
 *   including successful ones, which is what keeps the ledger current.
 *   Three problems this exists to solve, none of which a `gh` credential alone
 *   fixes:
 *
 *   1. AN UNAUTHENTICATED RUN IS INVISIBLE. Anonymous requests are served at
 *      60/hour against 5000, and GitHub does not announce the downgrade: the
 *      first calls succeed and later ones fail as ordinary errors. The limit
 *      value itself is the tell, so {@link classifyGitHubCredentialTier} turns
 *      a silent downgrade into something a caller can print and a test can
 *      assert.
 *   2. A SWEEP FINDS OUT TOO LATE. A loop over 40 repos with 12 requests left does
 *      a third of the work and reports failures for the rest, which reads as
 *      broken repos rather than a spent quota. {@link hasGitHubRateLimitBudget}
 *      answers before the loop starts.
 *   3. BLIND BACKOFF DOES NOT CLEAR A PRIMARY LIMIT. Exponential retry over a few
 *      seconds is right for a transient 5xx and useless against an hourly
 *      window that resets in 40 minutes: it burns its attempts and fails
 *      anyway. GitHub states the reset time, so the wait should be READ, not
 *      guessed. `github/rate-limit-wait` plans that wait and refuses when it
 *      exceeds what the caller will tolerate, rather than sleeping for an hour
 *      on its own initiative. Classification of a failed response (which limit,
 *      and is it retryable) is `github/error-classification`; this module owns
 *      the BUDGET, and the three compose: hand a classification's `waitSeconds`
 *      to `getGitHubRateLimitWaitMs` in `github/rate-limit-wait`.
 */

import { getGitHubResponseHeader } from './error-classification.mjs'

import { DateNow } from '../primordials/date.mjs'
import {
  MapCtor,
  MapPrototypeGet,
  MapPrototypeSet,
} from '../primordials/map-set.mjs'
import { MathFloor, MathMax } from '../primordials/math.mjs'
import { NumberIsFinite, NumberParseInt } from '../primordials/number.mjs'
import { ObjectFreeze } from '../primordials/object.mjs'

import type { GitHubResponseHeaders } from './error-classification.mjs'

/**
 * The hourly quota GitHub serves an unauthenticated caller.
 */
export const GITHUB_ANONYMOUS_HOURLY_LIMIT = 60

/**
 * The hourly quota GitHub serves an authenticated caller.
 */
export const GITHUB_AUTHENTICATED_HOURLY_LIMIT = 5000

/**
 * The resource whose quota a request counted against. GitHub meters REST,
 * search, and GraphQL separately, so a spent search budget says nothing about
 * the REST budget.
 */
export const DEFAULT_RATE_LIMIT_RESOURCE = 'core'

/**
 * A rate-limit budget as of one response.
 */
export interface GitHubRateLimitSnapshot {
  /**
   * Requests allowed in the current window, or `undefined` when the response
   * did not say.
   */
  limit: number | undefined
  /**
   * Requests left in the current window.
   */
  remaining: number | undefined
  /**
   * When the window resets, in epoch seconds.
   */
  resetEpochSeconds: number | undefined
  /**
   * Which metered resource this describes.
   */
  resource: string
  /**
   * Requests spent in the current window.
   */
  used: number | undefined
}

/**
 * How much quota the credential in use is worth, inferred from the limit
 * GitHub reported.
 *
 * - `anonymous` — no usable credential reached the API. 60/hour.
 * - `authenticated` — a token was accepted. 5000/hour.
 * - `elevated` — a higher allowance than a plain token, as GitHub Apps and
 *   Enterprise Cloud receive.
 * - `unknown` — no limit header, or a value matching none of the above.
 */
export type GitHubCredentialTier =
  | 'anonymous'
  | 'authenticated'
  | 'elevated'
  | 'unknown'

// Keyed by resource name. A Map rather than an object because the keys come
// from a response header, so they are attacker-adjacent input and must never
// reach a prototype slot.
const ledger = new MapCtor<string, GitHubRateLimitSnapshot>()

/**
 * Infer what the credential in use is worth from the limit GitHub reported.
 *
 * The limit is the only reliable signal available to a client. A request can
 * carry a malformed or expired token, get treated as anonymous, and still
 * return 200 for a public resource, so the presence of a token in the request
 * proves nothing about whether it was ACCEPTED. The limit reflects what GitHub
 * actually decided.
 *
 * @example
 *   ;```ts
 *   if (classifyGitHubCredentialTier(snapshot) === 'anonymous') {
 *     logger.warn('Running unauthenticated: 60 requests/hour.')
 *   }
 *   ```
 *
 * @param snapshot - The recorded budget, if any.
 *
 * @returns The inferred tier. `unknown` when there is nothing to infer from,
 *   which a caller should treat as "do not report a tier", never as anonymous.
 */
export function classifyGitHubCredentialTier(
  snapshot: GitHubRateLimitSnapshot | undefined,
): GitHubCredentialTier {
  const limit = snapshot?.limit
  if (limit === undefined) {
    return 'unknown'
  }
  if (limit <= GITHUB_ANONYMOUS_HOURLY_LIMIT) {
    return 'anonymous'
  }
  if (limit <= GITHUB_AUTHENTICATED_HOURLY_LIMIT) {
    return 'authenticated'
  }
  return 'elevated'
}

/**
 * Forget every recorded budget. For tests, and for a long-lived process that
 * changes credentials.
 *
 * @example
 *   ;```ts
 *   clearGitHubRateLimitLedger()
 *   ```
 */
export function clearGitHubRateLimitLedger(): void {
  // Not MapPrototypeClear: the ledger is module-private, and clear() on a Map
  // this module owns cannot be intercepted.
  ledger.clear()
}

/**
 * Seconds as `1h 2m 3s`, dropping empty leading units.
 */
export function formatDuration(totalSeconds: number): string {
  if (totalSeconds <= 0) {
    return 'now'
  }
  const hours = MathFloor(totalSeconds / 3600)
  const minutes = MathFloor((totalSeconds % 3600) / 60)
  const seconds = totalSeconds % 60
  const parts: string[] = []
  if (hours > 0) {
    parts.push(`${hours}h`)
  }
  if (minutes > 0) {
    parts.push(`${minutes}m`)
  }
  if (seconds > 0 || parts.length === 0) {
    parts.push(`${seconds}s`)
  }
  return parts.join(' ')
}

/**
 * Render a budget for a human, including the credential tier.
 *
 * Built for the line a sweep should print before it starts. Naming the tier is
 * the point: "43/60 remaining (anonymous)" tells an operator the run is
 * unauthenticated, which is the fact that a bare failure count hides.
 *
 * @example
 *   ;```ts
 *   logger.info(formatGitHubRateLimitStatus())
 *   // GitHub rate limit (core): 43/60 remaining, anonymous, resets in 12m 4s
 *   ```
 *
 * @param options - Resource and explicit-snapshot overrides.
 *
 * @returns A one-line description, including when the budget is unknown.
 */
export function formatGitHubRateLimitStatus(
  options?:
    | {
        now?: number | undefined
        resource?: string | undefined
        snapshot?: GitHubRateLimitSnapshot | undefined
      }
    | undefined,
): string {
  const opts = { __proto__: null, ...options } as {
    now?: number | undefined
    resource?: string | undefined
    snapshot?: GitHubRateLimitSnapshot | undefined
  }
  const resource = opts.resource ?? DEFAULT_RATE_LIMIT_RESOURCE
  const snapshot = opts.snapshot ?? getGitHubRateLimitSnapshot(resource)
  if (!snapshot) {
    return `GitHub rate limit (${resource}): unknown, no response recorded yet`
  }
  const parts: string[] = []
  if (snapshot.remaining !== undefined && snapshot.limit !== undefined) {
    parts.push(`${snapshot.remaining}/${snapshot.limit} remaining`)
  } else if (snapshot.remaining !== undefined) {
    parts.push(`${snapshot.remaining} remaining`)
  }
  const tier = classifyGitHubCredentialTier(snapshot)
  if (tier !== 'unknown') {
    parts.push(tier)
  }
  const seconds = resetInSeconds(snapshot, opts.now ?? DateNow())
  if (seconds !== undefined) {
    parts.push(`resets in ${formatDuration(seconds)}`)
  }
  return `GitHub rate limit (${snapshot.resource}): ${
    parts.length > 0 ? parts.join(', ') : 'no budget reported'
  }`
}

/**
 * The most recent budget recorded for a resource.
 *
 * @example
 *   ;```ts
 *   const snapshot = getGitHubRateLimitSnapshot()
 *   ```
 *
 * @param resource - The metered resource. Defaults to `core`, the REST budget.
 *
 * @returns The snapshot, or `undefined` when no response has been recorded for
 *   that resource yet.
 */
export function getGitHubRateLimitSnapshot(
  resource: string = DEFAULT_RATE_LIMIT_RESOURCE,
): GitHubRateLimitSnapshot | undefined {
  return MapPrototypeGet(ledger, resource)
}

/**
 * Options for {@link hasGitHubRateLimitBudget}.
 */
export interface HasGitHubRateLimitBudgetOptions {
  /**
   * Requests to hold back for other work. The check demands
   * `needed + reserve`, so a batch job can leave room for an interactive
   * caller sharing the same token.
   */
  reserve?: number | undefined
  /**
   * The metered resource. Defaults to `core`.
   */
  resource?: string | undefined
  /**
   * Budget to test instead of the ledger's. For preflighting against a
   * snapshot fetched some other way.
   */
  snapshot?: GitHubRateLimitSnapshot | undefined
}

/**
 * Whether the recorded budget covers `needed` more requests.
 *
 * Answers `true` when the budget is UNKNOWN. A library that refused to act on
 * absent telemetry would block the first request of every process, which is
 * exactly when nothing has been recorded yet. Unknown means "proceed and find
 * out", and the first response fills the ledger in.
 *
 * @example
 *   ;```ts
 *   if (!hasGitHubRateLimitBudget(repos.length, { reserve: 10 })) {
 *     logger.warn(formatGitHubRateLimitStatus())
 *   }
 *   ```
 *
 * @param needed - Requests the caller is about to make.
 * @param options - Reserve, resource, and explicit-snapshot overrides.
 *
 * @returns `true` when the budget covers the request, or is unknown.
 */
export function hasGitHubRateLimitBudget(
  needed: number,
  options?: HasGitHubRateLimitBudgetOptions | undefined,
): boolean {
  const opts = {
    __proto__: null,
    ...options,
  } as HasGitHubRateLimitBudgetOptions
  const snapshot =
    opts.snapshot ?? getGitHubRateLimitSnapshot(opts.resource ?? undefined)
  const remaining = snapshot?.remaining
  if (remaining === undefined) {
    return true
  }
  return remaining >= needed + (opts.reserve ?? 0)
}

/**
 * Read one header as a finite integer.
 */
export function headerAsInt(
  headers: GitHubResponseHeaders | undefined,
  name: string,
): number | undefined {
  const raw = getGitHubResponseHeader(headers, name)
  if (!raw) {
    return undefined
  }
  const parsed = NumberParseInt(raw, 10)
  return NumberIsFinite(parsed) ? parsed : undefined
}

/**
 * Parse a rate-limit budget out of response headers. Pure: it does not touch
 * the ledger, so a caller can inspect a response without recording it.
 *
 * @example
 *   ;```ts
 *   const snapshot = readGitHubRateLimitHeaders(response.headers)
 *   ```
 *
 * @param headers - The response headers.
 *
 * @returns The snapshot, or `undefined` when the response carried no
 *   rate-limit headers at all (a non-GitHub response, or a cached one).
 */
export function readGitHubRateLimitHeaders(
  headers: GitHubResponseHeaders | undefined,
): GitHubRateLimitSnapshot | undefined {
  const limit = headerAsInt(headers, 'x-ratelimit-limit')
  const remaining = headerAsInt(headers, 'x-ratelimit-remaining')
  const resetEpochSeconds = headerAsInt(headers, 'x-ratelimit-reset')
  const used = headerAsInt(headers, 'x-ratelimit-used')
  if (
    limit === undefined &&
    remaining === undefined &&
    resetEpochSeconds === undefined &&
    used === undefined
  ) {
    return undefined
  }
  return {
    limit,
    remaining,
    resetEpochSeconds,
    resource:
      getGitHubResponseHeader(headers, 'x-ratelimit-resource') ||
      DEFAULT_RATE_LIMIT_RESOURCE,
    used,
  }
}

/**
 * Record a response's rate-limit budget in the process-local ledger.
 *
 * Call this on EVERY response, not only failures. The budget on a successful
 * response is what lets the next preflight refuse a sweep before it starts;
 * recording only failures means the ledger is empty until something has
 * already gone wrong.
 *
 * @example
 *   ;```ts
 *   const response = await fetch(url, { headers })
 *   recordGitHubRateLimit(response.headers)
 *   ```
 *
 * @param headers - The response headers.
 *
 * @returns The recorded snapshot, or `undefined` when there was nothing to
 *   record.
 */
export function recordGitHubRateLimit(
  headers: GitHubResponseHeaders | undefined,
): GitHubRateLimitSnapshot | undefined {
  const snapshot = readGitHubRateLimitHeaders(headers)
  if (snapshot) {
    MapPrototypeSet(ledger, snapshot.resource, snapshot)
  }
  return snapshot
}

/**
 * Whole seconds until a window resets, floored at zero.
 */
export function resetInSeconds(
  snapshot: GitHubRateLimitSnapshot | undefined,
  now: number,
): number | undefined {
  const reset = snapshot?.resetEpochSeconds
  if (reset === undefined) {
    return undefined
  }
  return MathMax(0, reset - MathFloor(now / 1000))
}

/**
 * The rate-limit header names this module reads, for callers that need to
 * forward or log them.
 */
export const GITHUB_RATE_LIMIT_HEADERS: readonly string[] = ObjectFreeze([
  'x-ratelimit-limit',
  'x-ratelimit-remaining',
  'x-ratelimit-reset',
  'x-ratelimit-resource',
  'x-ratelimit-used',
])
