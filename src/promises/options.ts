/**
 * @fileoverview Option-shape normalizers for the iteration / retry
 * helpers. Three free functions — kept together because they're a tiny
 * cluster of pure transforms that callers cycle through:
 * `resolveRetryOptions` (number-shorthand → minimal object) →
 * `normalizeRetryOptions` (defaults + signal binding) →
 * `normalizeIterationOptions` (concurrency + retries combined).
 */

import { MathMax } from '../primordials/math'
import { abortSignal } from './_internal'

import type { IterationOptions, RetryOptions } from './types'

/**
 * Normalize options for iteration functions.
 *
 * Converts various option formats into a consistent structure with defaults applied.
 * Handles number shorthand for concurrency and ensures minimum values.
 *
 * @param options - Concurrency as number, or full options object, or undefined
 * @returns Normalized options with concurrency, retries, and signal
 *
 * @example
 * // Number shorthand for concurrency
 * normalizeIterationOptions(5)
 * // => { concurrency: 5, retries: {...}, signal: AbortSignal }
 *
 * @example
 * // Full options
 * normalizeIterationOptions({ concurrency: 3, retries: 2 })
 * // => { concurrency: 3, retries: {...}, signal: AbortSignal }
 */
/*@__NO_SIDE_EFFECTS__*/
export function normalizeIterationOptions(
  options?: number | IterationOptions | undefined,
): { concurrency: number; retries: RetryOptions; signal: AbortSignal } {
  // Handle number as concurrency shorthand
  const opts = typeof options === 'number' ? { concurrency: options } : options

  const {
    // The number of concurrent executions performed at one time.
    concurrency = 1,
    // Retries as a number or options object.
    retries,
    // AbortSignal used to support cancellation.
    signal = abortSignal,
  } = { __proto__: null, ...opts } as IterationOptions

  // Ensure concurrency is at least 1
  const normalizedConcurrency = MathMax(1, concurrency)
  const retryOpts = resolveRetryOptions(retries)
  return {
    __proto__: null,
    concurrency: normalizedConcurrency,
    retries: normalizeRetryOptions({ signal, ...retryOpts }),
    signal,
  } as { concurrency: number; retries: RetryOptions; signal: AbortSignal }
}

/**
 * Normalize options for retry functionality.
 *
 * Converts various retry option formats into a complete configuration with all defaults.
 * Handles legacy property names (`factor`, `minTimeout`, `maxTimeout`) and merges them
 * with modern equivalents.
 *
 * @param options - Retry count as number, or full options object, or undefined
 * @returns Normalized retry options with all properties set
 *
 * @example
 * // Number shorthand
 * normalizeRetryOptions(3)
 * // => { retries: 3, baseDelayMs: 200, backoffFactor: 2, ... }
 *
 * @example
 * // Full options with defaults filled in
 * normalizeRetryOptions({ retries: 5, baseDelayMs: 500 })
 * // => { retries: 5, baseDelayMs: 500, backoffFactor: 2, jitter: true, ... }
 */
/*@__NO_SIDE_EFFECTS__*/
export function normalizeRetryOptions(
  options?: number | RetryOptions | undefined,
): RetryOptions {
  const resolved = resolveRetryOptions(options)
  const {
    // Arguments to pass to the callback function.
    args = [],
    // Multiplier for exponential backoff (e.g., 2 doubles delay each retry).
    backoffFactor = 2,
    // Initial delay before the first retry (in milliseconds).
    baseDelayMs = 200,
    // Whether to apply randomness to spread out retries.
    jitter = true,
    // Upper limit for any backoff delay (in milliseconds).
    maxDelayMs = 10_000,
    // Optional callback invoked on each retry attempt:
    // (attempt: number, error: unknown, delay: number) => void
    onRetry,
    // Whether onRetry can cancel retries by returning `false`.
    onRetryCancelOnFalse = false,
    // Whether onRetry will rethrow errors.
    onRetryRethrow = false,
    // Number of retry attempts (0 = no retries, only initial attempt).
    retries = 0,
    // AbortSignal used to support cancellation.
    signal = abortSignal,
  } = resolved
  return {
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
  } as RetryOptions
}

/**
 * Resolve retry options from various input formats.
 *
 * Converts shorthand and partial options into a base configuration that can be
 * further normalized. This is an internal helper for option processing.
 *
 * @param options - Retry count as number, or partial options object, or undefined
 * @returns Resolved retry options with defaults for basic properties
 *
 * @example
 * resolveRetryOptions(3)
 * // => { retries: 3, minTimeout: 200, maxTimeout: 10000, factor: 2 }
 *
 * @example
 * resolveRetryOptions({ retries: 5, maxTimeout: 5000 })
 * // => { retries: 5, minTimeout: 200, maxTimeout: 5000, factor: 2 }
 */
/*@__NO_SIDE_EFFECTS__*/
export function resolveRetryOptions(
  options?: number | RetryOptions | undefined,
): RetryOptions {
  const defaults = {
    __proto__: null,
    retries: 0,
    baseDelayMs: 200,
    maxDelayMs: 10_000,
    backoffFactor: 2,
  }

  if (typeof options === 'number') {
    return { ...defaults, retries: options }
  }

  return options ? { ...defaults, ...options } : defaults
}
