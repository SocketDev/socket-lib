/**
 * @fileoverview `pRetry` — exponential-backoff retry with optional
 * jitter, abort-signal support, and an `onRetry` hook for customizing
 * delays or canceling retries entirely.
 *
 * Cycles with `iterate.ts`: pRetry is called by pEach / pEachChunk /
 * pFilter / pFilterChunk to apply per-item retry. ESM tolerates the
 * cycle since both sides reference each other through functions only.
 */

import { UNDEFINED_TOKEN } from '../constants/core'
import { MathFloor, MathMin, MathRandom } from '../primordials/math'
import { getTimers } from './_internal'
import { normalizeRetryOptions } from './options'

import type { RetryOptions } from './types'

/**
 * Retry an async function with exponential backoff.
 *
 * Attempts to execute a function multiple times with increasing delays between attempts.
 * Implements exponential backoff with optional jitter to prevent thundering herd problems.
 * Supports custom retry logic via `onRetry` callback.
 *
 * The delay calculation follows: `min(baseDelayMs * (backoffFactor ** attempt), maxDelayMs)`
 * With jitter: adds random value between 0 and calculated delay.
 *
 * @template T - The return type of the callback function
 * @param callbackFn - Async function to retry
 * @param options - Retry count as number, or full retry options, or undefined
 * @returns Promise resolving to callback result, or `undefined` if aborted
 *
 * @throws {Error} The last error if all retry attempts fail
 *
 * @example
 * // Simple retry: 3 attempts with default backoff
 * const data = await pRetry(async () => {
 *   return await fetchData()
 * }, 3)
 *
 * @example
 * // Custom backoff strategy
 * const result = await pRetry(async () => {
 *   return await unreliableOperation()
 * }, {
 *   retries: 5,
 *   baseDelayMs: 1000,    // Start at 1 second
 *   backoffFactor: 2,      // Double each time
 *   maxDelayMs: 30000,     // Cap at 30 seconds
 *   jitter: true           // Add randomness
 * })
 * // Delays: ~1s, ~2s, ~4s, ~8s, ~16s (each ± random jitter)
 *
 * @example
 * // With custom retry logic
 * const data = await pRetry(async () => {
 *   return await apiCall()
 * }, {
 *   retries: 3,
 *   onRetry: (attempt, error, delay) => {
 *     console.log(`Attempt ${attempt} failed: ${error}`)
 *     console.log(`Waiting ${delay}ms before retry...`)
 *
 *     // Cancel retries for client errors (4xx)
 *     if (error.statusCode >= 400 && error.statusCode < 500) {
 *       return false
 *     }
 *
 *     // Use longer delay for rate limit errors
 *     if (error.statusCode === 429) {
 *       return 60000 // Wait 1 minute
 *     }
 *   },
 *   onRetryCancelOnFalse: true
 * })
 *
 * @example
 * // With cancellation support
 * const controller = new AbortController()
 * setTimeout(() => controller.abort(), 5000) // Cancel after 5s
 *
 * const result = await pRetry(async ({ signal }) => {
 *   return await longRunningTask(signal)
 * }, {
 *   retries: 10,
 *   signal: controller.signal
 * })
 * // Returns undefined if aborted
 *
 * @example
 * // Pass arguments to callback
 * const result = await pRetry(
 *   async (url, options) => {
 *     return await fetch(url, options)
 *   },
 *   {
 *     retries: 3,
 *     args: ['https://api.example.com', { method: 'POST' }]
 *   }
 * )
 */
/*@__NO_SIDE_EFFECTS__*/
export async function pRetry<T>(
  callbackFn: (...args: unknown[]) => Promise<T>,
  options?: number | RetryOptions | undefined,
): Promise<T | undefined> {
  const {
    args,
    backoffFactor,
    baseDelayMs,
    jitter,
    maxDelayMs,
    onRetry,
    onRetryCancelOnFalse,
    onRetryRethrow,
    retries,
    signal,
  } = normalizeRetryOptions(options)
  if (signal?.aborted) {
    return undefined
  }
  if (retries === 0) {
    return await callbackFn(...(args || []), { signal })
  }

  const timers = getTimers()

  let attempts = retries as number
  let delay = baseDelayMs as number
  let error: unknown = UNDEFINED_TOKEN

  while (attempts-- >= 0) {
    // Abort-before-attempt requires signal aborted between iterations.
    /* c8 ignore start */
    if (signal?.aborted) {
      return undefined
    }
    /* c8 ignore stop */

    try {
      // eslint-disable-next-line no-await-in-loop
      return await callbackFn(...(args || []), { signal })
    } catch (e) {
      error = e
      if (attempts < 0) {
        break
      }
      let waitTime = delay
      if (jitter) {
        // Add randomness: Pick a value between 0 and `delay`.
        waitTime += MathFloor(MathRandom() * delay)
      }
      // Clamp wait time to max delay.
      waitTime = MathMin(waitTime, maxDelayMs as number)
      // onRetry callback variants (return-false-cancel, return-number-
      // override-delay, throw-rethrow) fire only when caller passes a
      // sophisticated onRetry. Most tests use no onRetry.
      /* c8 ignore start */
      if (typeof onRetry === 'function') {
        try {
          const result = onRetry((retries as number) - attempts, e, waitTime)
          if (result === false && onRetryCancelOnFalse) {
            break
          }
          if (typeof result === 'number' && result >= 0) {
            waitTime = MathMin(result, maxDelayMs as number)
          }
        } catch (e) {
          if (onRetryRethrow) {
            throw e
          }
        }
      }
      /* c8 ignore stop */

      try {
        // eslint-disable-next-line no-await-in-loop
        await timers.setTimeout(waitTime, undefined, { signal })
        // Abort during setTimeout fires only when signal is aborted
        // mid-delay; tests cover abort during fn but not during delay.
        /* c8 ignore start */
      } catch {
        return undefined
      }
      /* c8 ignore stop */

      // Abort-after-delay requires precise timing.
      /* c8 ignore start */
      if (signal?.aborted) {
        return undefined
      }
      /* c8 ignore stop */

      // Exponentially increase the delay for the next attempt, capping at maxDelayMs.
      delay = MathMin(delay * (backoffFactor as number), maxDelayMs as number)
    }
  }
  if (error !== UNDEFINED_TOKEN) {
    throw error
  }
  /* c8 ignore next - Fallback when retries=0 and fn never errored;
     unreachable since the success path returns from inside the try. */
  return undefined
}
