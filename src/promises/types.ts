/**
 * @file Public type surface for `promises/*` modules: `RetryOptions`,
 *   `IterationOptions`, and `PromiseWithResolvers`. Pure types, no runtime side
 *   effects.
 */

/**
 * Configuration options for retry behavior with exponential backoff.
 *
 * Controls how failed operations are retried, including timing, backoff
 * strategy, and callback hooks for observing or modifying retry behavior.
 */
export interface RetryOptions {
  /**
   * Arguments to pass to the callback function on each attempt.
   *
   * @default [ ]
   */
  args?: unknown[] | undefined

  /**
   * Multiplier for exponential backoff (e.g., 2 doubles delay each retry). Each
   * retry waits `baseDelayMs * (backoffFactor ** attemptNumber)`.
   *
   * @example
   *   // With backoffFactor: 2, baseDelayMs: 100
   *   // Retry 1: 100ms
   *   // Retry 2: 200ms
   *   // Retry 3: 400ms
   *
   * @default 2
   */
  backoffFactor?: number | undefined

  /**
   * Initial delay before the first retry (in milliseconds). This is the base
   * value for exponential backoff calculations.
   *
   * @default 200
   */
  baseDelayMs?: number | undefined

  // REMOVED: Deprecated `factor` option
  // Migration: Use `backoffFactor` instead

  /**
   * Whether to apply randomness to spread out retries and avoid thundering
   * herd. When `true`, adds random delay between 0 and current delay value.
   *
   * @example
   *   // With jitter: true, delay: 100ms
   *   // Actual wait: 100ms + random(0-100ms) = 100-200ms
   *
   * @default true
   */
  jitter?: boolean | undefined

  /**
   * Upper limit for any backoff delay (in milliseconds). Prevents exponential
   * backoff from growing unbounded.
   *
   * @default 10000
   */
  maxDelayMs?: number | undefined

  // REMOVED: Deprecated `maxTimeout` option
  // Migration: Use `maxDelayMs` instead

  // REMOVED: Deprecated `minTimeout` option
  // Migration: Use `baseDelayMs` instead

  /**
   * Callback invoked on each retry attempt. Can observe errors, customize
   * delays, or cancel retries.
   *
   * @example
   *   // Log each retry
   *   onRetry: (attempt, error, delay) => {
   *     console.log(`Retry ${attempt} after ${delay}ms: ${error}`)
   *   }
   *
   * @example
   *   // Cancel retries for specific errors
   *   onRetry: (attempt, error) => {
   *     if (error instanceof ValidationError) return false
   *   }
   *
   * @example
   *   // Use custom delay
   *   onRetry: attempt => attempt * 1000 // 1s, 2s, 3s, ...
   *
   * @param attempt - The current attempt number (1-based: 1, 2, 3, ...)
   * @param error - The error that triggered this retry.
   * @param delay - The calculated delay in milliseconds before next retry.
   *
   * @returns `false` to cancel retries (if `onRetryCancelOnFalse` is `true`), a
   *   number to override the delay, or `undefined` to use calculated delay.
   */
  onRetry?:
    | ((
        attempt: number,
        error: unknown,
        delay: number,
      ) => boolean | number | undefined)
    | undefined

  /**
   * Whether `onRetry` can cancel retries by returning `false`. When `true`,
   * returning `false` from `onRetry` stops retry attempts.
   *
   * @default false
   */
  onRetryCancelOnFalse?: boolean | undefined

  /**
   * Whether errors thrown by `onRetry` should propagate. When `true`,
   * exceptions in `onRetry` terminate the retry loop. When `false`, exceptions
   * in `onRetry` are silently caught.
   *
   * @default false
   */
  onRetryRethrow?: boolean | undefined

  /**
   * Number of retry attempts (0 = no retries, only initial attempt). The
   * callback is executed `retries + 1` times total (initial + retries).
   *
   * @example
   *   // retries: 0 -> 1 total attempt (no retries)
   *   // retries: 3 -> 4 total attempts (1 initial + 3 retries)
   *
   * @default 0
   */
  retries?: number | undefined

  /**
   * AbortSignal to support cancellation of retry operations. When aborted,
   * immediately stops retrying and returns `undefined`.
   *
   * @example
   *   const controller = new AbortController()
   *   pRetry(fn, { signal: controller.signal })
   *   // Later: controller.abort() to cancel
   *
   * @default process abort signal
   */
  signal?: AbortSignal | undefined
}

/**
 * Configuration options for iteration functions with concurrency control.
 *
 * Controls how array operations are parallelized and retried.
 */
export interface IterationOptions {
  /**
   * The number of concurrent executions performed at one time. Higher values
   * increase parallelism but may overwhelm resources.
   *
   * @example
   *   // Process 5 items at a time
   *   await pEach(items, processItem, { concurrency: 5 })
   *
   * @default 1
   */
  concurrency?: number | undefined

  /**
   * Retry configuration as a number (retry count) or full options object.
   * Applied to each individual item's callback execution.
   *
   * @example
   *   // Simple: retry each item up to 3 times
   *   await pEach(items, fetchItem, { retries: 3 })
   *
   * @example
   *   // Advanced: custom backoff for each item
   *   await pEach(items, fetchItem, {
   *     retries: {
   *       retries: 3,
   *       baseDelayMs: 1000,
   *       backoffFactor: 2,
   *     },
   *   })
   *
   * @default 0 (no retries)
   */
  retries?: number | RetryOptions | undefined

  /**
   * AbortSignal to support cancellation of the entire iteration. When aborted,
   * stops processing remaining items.
   *
   * @default process abort signal
   */
  signal?: AbortSignal | undefined
}

/**
 * Shape returned by {@link withResolvers}: a fresh pending promise plus the
 * `resolve` / `reject` handles that settle it.
 *
 * Matches the spec return-shape exactly ([ECMA-262
 * §27.2.4.9](https://tc39.es/ecma262/#sec-promise.withResolvers)).
 */
export interface PromiseWithResolvers<T> {
  /**
   * The pending promise.
   */
  promise: Promise<T>
  /**
   * Resolves {@link promise} with the given value (or thenable).
   */
  resolve: (value: T | PromiseLike<T>) => void
  /**
   * Rejects {@link promise} with the given reason.
   */
  reject: (reason?: unknown) => void
}
