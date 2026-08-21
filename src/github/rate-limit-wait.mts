/**
 * @file Reset-aware waiting for a throttled GitHub request. Split out of
 *   `github/rate-limit` for size hygiene; that module owns the BUDGET, this one
 *   owns what to do about a spent one. Why this is not exponential backoff.
 *   Blind backoff is right for a transient 5xx, where the fault is unknown and
 *   doubling the delay is the best available guess. It is wrong for a rate
 *   limit, where GitHub STATES when the window reopens: a 5s/10s/20s ladder
 *   against a window that resets in 40 minutes burns its attempts and fails
 *   anyway, having waited 35 seconds to learn nothing. So the wait here is read
 *   from `Retry-After` or `x-ratelimit-reset` rather than guessed. The planner
 *   and the sleeper are separate on purpose. The DECISION (wait, and for how
 *   long) is pure and testable in microseconds;
 *   {@link waitForGitHubRateLimitReset} is the thin wrapper that spends
 *   wallclock. A test suite that could only assert the wrapper would have to
 *   sleep to cover the branches, and would sleep for the cap on the branch that
 *   matters most. Declining to wait is reported as `0`, never an error. Whether
 *   a wait that is too long should fail the run or skip the resource depends on
 *   the caller, so this module refuses to decide.
 */

import { sleep } from '../promises/timers.mjs'

import { getGitHubRateLimitSnapshot, resetInSeconds } from './rate-limit.mjs'

import { DateNow } from '../primordials/date.mjs'
import { MathMin, MathRound } from '../primordials/math.mjs'

import type { GitHubRateLimitSnapshot } from './rate-limit.mjs'

/**
 * The default ceiling on how long {@link waitForGitHubRateLimitReset} will
 * sleep. One minute, deliberately far below the hour a primary window can run,
 * because a library that sleeps for an hour without being told to looks
 * indistinguishable from a hang. A caller that genuinely wants to wait out a
 * full window passes its own `maxWaitMs`.
 */
export const DEFAULT_MAX_RATE_LIMIT_WAIT_MS = 60_000

/**
 * Options for {@link getGitHubRateLimitWaitMs} and
 * {@link waitForGitHubRateLimitReset}.
 */
export interface GitHubRateLimitWaitOptions {
  /**
   * The longest wait to allow. Beyond this the plan is to give up rather than
   * sleep. Defaults to {@link DEFAULT_MAX_RATE_LIMIT_WAIT_MS}.
   */
  maxWaitMs?: number | undefined
  /**
   * The current clock, in epoch milliseconds. For tests.
   */
  now?: number | undefined
  /**
   * The metered resource. Defaults to `core`.
   */
  resource?: string | undefined
  /**
   * Budget to plan against instead of the ledger's.
   */
  snapshot?: GitHubRateLimitSnapshot | undefined
  /**
   * An explicit wait, as `classifyGitHubErrorResponse` reports it. Takes
   * precedence over the ledger, because it came from the response that was
   * actually refused and reflects a secondary limit's `Retry-After` that no
   * budget header carries.
   */
  waitSeconds?: number | undefined
}

/**
 * How long to wait before a throttled request could succeed, or `undefined`
 * when waiting is not the right move.
 *
 * Pure, and separate from the sleeping so the decision is testable without
 * spending wallclock. `undefined` covers three distinct cases the caller
 * handles the same way (do not wait, fail or continue instead): nothing said
 * when the window resets, the window has already reset so there is nothing to
 * wait for, and the wait is longer than `maxWaitMs`.
 *
 * @example
 *   ;```ts
 *   const blocked = classifyGitHubErrorResponse(response)
 *   const waitMs = getGitHubRateLimitWaitMs({
 *     waitSeconds: blocked?.waitSeconds,
 *   })
 *   ```
 *
 * @param options - Explicit wait, ledger overrides, and the cap.
 *
 * @returns Milliseconds to wait, or `undefined` to not wait.
 */
export function getGitHubRateLimitWaitMs(
  options?: GitHubRateLimitWaitOptions | undefined,
): number | undefined {
  const opts = { __proto__: null, ...options } as GitHubRateLimitWaitOptions
  const maxWaitMs = opts.maxWaitMs ?? DEFAULT_MAX_RATE_LIMIT_WAIT_MS
  if (maxWaitMs <= 0) {
    return undefined
  }
  const now = opts.now ?? DateNow()
  const seconds =
    opts.waitSeconds ??
    resetInSeconds(
      opts.snapshot ?? getGitHubRateLimitSnapshot(opts.resource ?? undefined),
      now,
    )
  if (seconds === undefined || seconds <= 0) {
    return undefined
  }
  const waitMs = MathRound(seconds * 1000)
  return waitMs > maxWaitMs ? undefined : MathMin(waitMs, maxWaitMs)
}

/**
 * Wait out a rate limit, if waiting is the right move.
 *
 * Sleeps only for a wait GitHub actually stated and only up to `maxWaitMs`.
 * Declining is reported as `0` rather than an error, so the caller decides
 * whether to fail or carry on.
 *
 * @example
 *   ;```ts
 *   const waited = await waitForGitHubRateLimitReset({
 *     waitSeconds: blocked?.waitSeconds,
 *   })
 *   if (waited === 0) {
 *     throw new ErrorCtor(formatGitHubRateLimitStatus())
 *   }
 *   ```
 *
 * @param options - Explicit wait, ledger overrides, and the cap.
 *
 * @returns Milliseconds actually slept. `0` when it declined to wait.
 */
export async function waitForGitHubRateLimitReset(
  options?: GitHubRateLimitWaitOptions | undefined,
): Promise<number> {
  const waitMs = getGitHubRateLimitWaitMs(options)
  if (waitMs === undefined) {
    return 0
  }
  await sleep(waitMs)
  return waitMs
}
