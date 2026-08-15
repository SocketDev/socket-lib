/**
 * @file Classify a GitHub API error response from its status, headers, and
 *   body. Pure data in, pure data out — no fetch, no logging, no result type —
 *   so any caller can run it against whatever HTTP client it already uses.
 *   GitHub reports three conditions in ways that are easy to misread as
 *   ordinary failures, and misreading one turns a throttled run into a silent
 *   success. A rate limit arrives as HTTP 429, or as HTTP 403 carrying
 *   `x-ratelimit-remaining: 0` — that second form has no distinguishing status
 *   code, so code that reads the body without checking the status sees "this
 *   repo has nothing to return". Abuse detection, GitHub's secondary rate
 *   limit, arrives as HTTP 403 with a body saying so, sharing its status with
 *   both the rate-limit form and a plain permission denial. An auth failure
 *   arrives as HTTP 401, meaning the token is invalid, expired, or missing a
 *   scope, so no amount of waiting helps.
 *   All three are BLOCKING: they turn on the credential and the clock, not on
 *   the resource being requested, so every later request in a loop over repos
 *   fails the same way. A caller iterating resources should stop on the first
 *   one instead of retrying it or moving to the next. A plain permission denial
 *   is deliberately NOT one of them — that one IS about the resource, so
 *   skipping it and continuing is right.
 *   Retry policy for what comes back lives in `releases/github-retry-config`;
 *   this module only decides WHAT a response is.
 */

import { parseRetryAfterHeader } from '../http-request/headers.mjs'

import { ArrayIsArray } from '../primordials/array.mjs'
import { DateNow } from '../primordials/date.mjs'
import { MathFloor, MathMax } from '../primordials/math.mjs'
import { NumberIsFinite, NumberParseInt } from '../primordials/number.mjs'
import { ObjectFreeze, ObjectKeys } from '../primordials/object.mjs'
import {
  StringPrototypeIncludes,
  StringPrototypeToLowerCase,
} from '../primordials/string.mjs'

/**
 * Which blocking condition a GitHub error response represents.
 *
 * - `abuse-detection` — the secondary rate limit, tripped by bursty traffic.
 * - `auth-failure` — the credential itself is rejected.
 * - `rate-limit` — the primary hourly quota is spent.
 */
export type GitHubErrorKind = 'abuse-detection' | 'auth-failure' | 'rate-limit'

/**
 * Every kind {@link classifyGitHubErrorResponse} can return, in sorted order.
 *
 * Exported so a caller can derive its own blocking-condition table from this
 * list rather than hard-coding one. A caller that does so picks up a future
 * kind for free instead of silently treating it as an ordinary error.
 */
export const GITHUB_BLOCKING_ERROR_KINDS: readonly GitHubErrorKind[] =
  ObjectFreeze(['abuse-detection', 'auth-failure', 'rate-limit'])

/**
 * What {@link classifyGitHubErrorResponse} decided about a response. Getting one
 * back at all means the condition is blocking.
 */
export interface GitHubErrorClassification {
  /**
   * Which condition this is.
   */
  kind: GitHubErrorKind
  /**
   * Whether waiting can clear the condition. `true` for the two rate limits,
   * `false` for an auth failure, which the same token never recovers from.
   */
  retryable: boolean
  /**
   * Seconds until the limit resets, read from `Retry-After` or
   * `x-ratelimit-reset`. `undefined` when the response did not say, which is
   * the common case for the primary hourly limit.
   */
  waitSeconds: number | undefined
}

/**
 * Response headers in either shape a caller is likely to hold: a Fetch
 * `Headers` object, or the plain record that Node's HTTP layer produces.
 */
export type GitHubResponseHeaders =
  | { get(name: string): string | null }
  | Record<string, string | string[] | undefined>

/**
 * Classify a GitHub API response as one of the blocking conditions.
 *
 * Order matters: abuse detection is checked before the primary rate limit
 * because both arrive as HTTP 403 and the abuse form is the more specific of
 * the two.
 *
 * @example
 *   ;```ts
 *   const bodyText = await response.text()
 *   const blocked = classifyGitHubErrorResponse({
 *     body: bodyText,
 *     headers: response.headers,
 *     status: response.status,
 *   })
 *   if (blocked) {
 *     // Stop the loop; every later request fails the same way.
 *   }
 *   ```
 *
 * @param response - The status, headers, and body text to classify.
 *
 * @returns The classification, or `undefined` when the response is not one of
 *   the blocking conditions. `undefined` covers healthy responses and ordinary
 *   errors alike, so the caller keeps its own handling of 404s, empty repos,
 *   and permission denials.
 */
export function classifyGitHubErrorResponse(response: {
  body?: string | undefined
  headers?: GitHubResponseHeaders | undefined
  status: number
}): GitHubErrorClassification | undefined {
  const { body, headers, status } = response
  const lowerBody = body ? StringPrototypeToLowerCase(body) : ''

  if (
    status === 403 &&
    (StringPrototypeIncludes(lowerBody, 'secondary rate limit') ||
      StringPrototypeIncludes(lowerBody, 'abuse detection'))
  ) {
    return {
      kind: 'abuse-detection',
      retryable: true,
      waitSeconds: getGitHubRateLimitWaitSeconds(headers),
    }
  }

  const remaining = getGitHubResponseHeader(headers, 'x-ratelimit-remaining')
  if (
    status === 429 ||
    (status === 403 &&
      (remaining === '0' || StringPrototypeIncludes(lowerBody, 'rate limit')))
  ) {
    return {
      kind: 'rate-limit',
      retryable: true,
      waitSeconds: getGitHubRateLimitWaitSeconds(headers),
    }
  }

  if (status === 401) {
    return {
      kind: 'auth-failure',
      retryable: false,
      waitSeconds: undefined,
    }
  }

  return undefined
}

/**
 * Seconds to wait before a throttled GitHub request could succeed.
 *
 * Prefers `Retry-After`, which GitHub sends on secondary limits and which RFC
 * 7231 allows to be either a delay in seconds or an absolute HTTP date. Falls
 * back to `x-ratelimit-reset`, an absolute epoch-seconds timestamp, converted
 * to a relative wait against the current clock and floored at zero so a reset
 * already in the past reads as "no wait" instead of a negative number.
 *
 * @example
 *   ;```ts
 *   const seconds = getGitHubRateLimitWaitSeconds(response.headers)
 *   if (seconds !== undefined && seconds <= 30) {
 *     // Short enough to wait out.
 *   }
 *   ```
 *
 * @param headers - The response headers.
 *
 * @returns Whole seconds to wait, or `undefined` when neither header is usable.
 */
export function getGitHubRateLimitWaitSeconds(
  headers: GitHubResponseHeaders | undefined,
): number | undefined {
  const retryAfterMs = parseRetryAfterHeader(
    getGitHubResponseHeader(headers, 'retry-after'),
  )
  if (retryAfterMs !== undefined) {
    return MathFloor(retryAfterMs / 1000)
  }
  const reset = getGitHubResponseHeader(headers, 'x-ratelimit-reset')
  if (reset) {
    const resetEpochSeconds = NumberParseInt(reset, 10)
    if (NumberIsFinite(resetEpochSeconds)) {
      return MathMax(0, resetEpochSeconds - MathFloor(DateNow() / 1000))
    }
  }
  return undefined
}

/**
 * Read one header out of either header shape.
 *
 * A Fetch `Headers` already matches names case-insensitively. A plain record
 * does not, so the record branch compares lowercased keys rather than trusting
 * the caller to have normalized them. An array-valued header yields its first
 * entry, matching how Node exposes repeated headers.
 *
 * @param headers - The response headers.
 * @param name - The header name, lowercase.
 *
 * @returns The header value, or `undefined` when absent.
 */
export function getGitHubResponseHeader(
  headers: GitHubResponseHeaders | undefined,
  name: string,
): string | undefined {
  if (!headers) {
    return undefined
  }
  const getter = (headers as { get?: unknown | undefined }).get
  if (typeof getter === 'function') {
    const value = (headers as { get(name: string): string | null }).get(name)
    return value === null ? undefined : value
  }
  const record = headers as Record<string, string | string[] | undefined>
  for (const key of ObjectKeys(record)) {
    if (StringPrototypeToLowerCase(key) !== name) {
      continue
    }
    const value = record[key]
    return ArrayIsArray(value) ? value[0] : value
  }
  return undefined
}
