/**
 * @file Shared retry configuration for the GitHub release helpers
 *   (`github-listing`, `github-asset-url`). Exponential backoff over the
 *   transient-failure / rate-limit surface. `baseDelayMs` is overridable via
 *   `SOCKET_GITHUB_RETRY_BASE_DELAY_MS` — set it to `0` for near-instant
 *   retries. Tests set it so the backoff sleep (5s + 10s of real wallclock)
 *   doesn't run: pRetry's delay goes through `node:timers/promises`, which
 *   `vi.useFakeTimers()` doesn't reliably intercept, so a zero base delay is
 *   the robust, fake-timer-independent way to keep these tests fast. CI can
 *   also dial it down. Default stays 5000ms for production resilience.
 */

import { envAsNumber } from '../env/number'
import { getEnvValue } from '../env/rewire'

import { ObjectFreeze } from '../primordials/object'

/**
 * Default base delay (ms) before the first retry when the env override is unset
 * or non-numeric.
 */
export const DEFAULT_BASE_DELAY_MS = 5000

/**
 * Resolve the retry base delay from `SOCKET_GITHUB_RETRY_BASE_DELAY_MS`,
 * falling back to {@link DEFAULT_BASE_DELAY_MS}. Read live (not memoized) so
 * it's unit-testable by mutating the env — and so a long-lived process that has
 * the env changed under it picks up the new value on next read.
 *
 * @returns The configured base delay in milliseconds.
 */
export function resolveBaseDelayMs(): number {
  return envAsNumber(
    getEnvValue('SOCKET_GITHUB_RETRY_BASE_DELAY_MS'),
    DEFAULT_BASE_DELAY_MS,
  )
}

export const GITHUB_RETRY_CONFIG = ObjectFreeze({
  __proto__: null,
  // Exponential backoff: delay doubles with each retry (5s, 10s, 20s).
  backoffFactor: 2,
  // Initial delay before first retry. Overridable for tests / CI.
  baseDelayMs: resolveBaseDelayMs(),
  // Maximum number of retry attempts (excluding initial request).
  retries: 2,
})
