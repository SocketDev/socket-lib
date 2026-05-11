/**
 * @fileoverview Lifecycle wrappers around `Spinner` — `withSpinner`
 * (async, push-pop options + auto-stop), `withSpinnerRestore`
 * (conditionally restart a previously-spinning instance), and
 * `withSpinnerSync` (sync sibling of `withSpinner`). Each wrapper
 * guarantees `spinner.stop()` runs via `try/finally` even when the
 * inner operation throws, then re-throws the original error so
 * callers see the same failure surface as a plain `await`.
 */

import process from 'node:process'

import { toRgb } from '../colors/convert'

import type {
  WithSpinnerOptions,
  WithSpinnerRestoreOptions,
  WithSpinnerSyncOptions,
} from './types'

/**
 * Execute an async operation with spinner lifecycle management.
 * Ensures `spinner.stop()` is always called via try/finally, even if the operation throws.
 * Provides safe cleanup and consistent spinner behavior.
 *
 * @template T - Return type of the operation
 * @param options - Configuration object
 * @param options.message - Message to display while spinner is running
 * @param options.operation - Async function to execute
 * @param options.spinner - Optional spinner instance (if not provided, no spinner is used)
 * @returns Result of the operation
 * @throws Re-throws any error from operation after stopping spinner
 *
 * @example
 * ```ts
 * import { Spinner } from '@socketsecurity/lib/spinner/spinner'
 * import { withSpinner } from '@socketsecurity/lib/spinner/with'
 *
 * const spinner = Spinner()
 *
 * // With spinner instance
 * const result = await withSpinner({
 *   message: 'Processing…',
 *   operation: async () => {
 *     return await processData()
 *   },
 *   spinner
 * })
 *
 * // Without spinner instance (no-op, just runs operation)
 * const result = await withSpinner({
 *   message: 'Processing…',
 *   operation: async () => {
 *     return await processData()
 *   }
 * })
 * ```
 */
export async function withSpinner<T>(
  options: WithSpinnerOptions<T>,
): Promise<T> {
  const { message, operation, spinner, withOptions } = {
    __proto__: null,
    ...options,
  } as WithSpinnerOptions<T>

  if (!spinner) {
    return await operation()
  }

  // Save current options if we're going to change them
  const savedColor =
    withOptions?.color !== undefined ? spinner.color : undefined
  const savedShimmerState =
    withOptions?.shimmer !== undefined ? spinner.shimmerState : undefined

  // Apply temporary options
  if (withOptions?.color !== undefined) {
    spinner.color = toRgb(withOptions.color)
  }
  if (withOptions?.shimmer !== undefined) {
    if (typeof withOptions.shimmer === 'string') {
      spinner.updateShimmer({ dir: withOptions.shimmer })
    } else {
      spinner.setShimmer(withOptions.shimmer)
    }
  }

  spinner.start(message)
  try {
    return await operation()
  } finally {
    const wasSpinning = spinner.isSpinning
    spinner.stop()

    // Clear any remaining spinner artifacts that yocto-spinner's clear() misses.
    // Despite yocto-spinner calling clear(), ANSI-colored spinner frames can sometimes
    // leave visual artifacts on the line. A final explicit clear ensures clean output.
    // Only clear if spinner was actually running (which means it was already interactive).
    // Each restore branch fires only when caller seeded the
    // corresponding option; tests cover paths individually.
    /* c8 ignore start */
    if (wasSpinning) {
      process.stderr.write('\r\x1B[2K') // socket-hook: allow logger
    }

    if (savedColor !== undefined) {
      spinner.color = savedColor
    }
    if (withOptions?.shimmer !== undefined) {
      if (savedShimmerState) {
        spinner.setShimmer({
          color: savedShimmerState.color as any,
          dir: savedShimmerState.direction,
          speed: savedShimmerState.speed,
        })
      } else {
        spinner.disableShimmer()
      }
    }
    /* c8 ignore stop */
  }
}

/**
 * Execute an async operation with conditional spinner restart.
 * Useful when you need to temporarily stop a spinner for an operation,
 * then restore it to its previous state (if it was spinning).
 *
 * @template T - Return type of the operation
 * @param options - Configuration object
 * @param options.operation - Async function to execute
 * @param options.spinner - Optional spinner instance to manage
 * @param options.wasSpinning - Whether spinner was spinning before the operation
 * @returns Result of the operation
 * @throws Re-throws any error from operation after restoring spinner state
 *
 * @example
 * ```ts
 * import { getDefaultSpinner } from '@socketsecurity/lib/spinner/registry'
 * import { withSpinnerRestore } from '@socketsecurity/lib/spinner/with'
 *
 * const spinner = getDefaultSpinner()
 * const wasSpinning = spinner.isSpinning
 * spinner.stop()
 *
 * const result = await withSpinnerRestore({
 *   operation: async () => {
 *     // Do work without spinner
 *     return await someOperation()
 *   },
 *   spinner,
 *   wasSpinning
 * })
 * // Spinner is automatically restarted if wasSpinning was true
 * ```
 */
export async function withSpinnerRestore<T>(
  options: WithSpinnerRestoreOptions<T>,
): Promise<T> {
  const { operation, spinner, wasSpinning } = {
    __proto__: null,
    ...options,
  } as WithSpinnerRestoreOptions<T>

  try {
    return await operation()
  } finally {
    if (spinner && wasSpinning) {
      spinner.start()
    }
  }
}

/**
 * Execute a synchronous operation with spinner lifecycle management.
 * Ensures `spinner.stop()` is always called via try/finally, even if the operation throws.
 * Provides safe cleanup and consistent spinner behavior for sync operations.
 *
 * @template T - Return type of the operation
 * @param options - Configuration object
 * @param options.message - Message to display while spinner is running
 * @param options.operation - Synchronous function to execute
 * @param options.spinner - Optional spinner instance (if not provided, no spinner is used)
 * @returns Result of the operation
 * @throws Re-throws any error from operation after stopping spinner
 *
 * @example
 * ```ts
 * import { Spinner } from '@socketsecurity/lib/spinner/spinner'
 * import { withSpinnerSync } from '@socketsecurity/lib/spinner/with'
 *
 * const spinner = Spinner()
 *
 * const result = withSpinnerSync({
 *   message: 'Processing…',
 *   operation: () => {
 *     return processDataSync()
 *   },
 *   spinner
 * })
 * ```
 */
export function withSpinnerSync<T>(options: WithSpinnerSyncOptions<T>): T {
  const { message, operation, spinner, withOptions } = {
    __proto__: null,
    ...options,
  } as WithSpinnerSyncOptions<T>

  if (!spinner) {
    return operation()
  }

  // Save current options if we're going to change them
  const savedColor =
    withOptions?.color !== undefined ? spinner.color : undefined
  const savedShimmerState =
    withOptions?.shimmer !== undefined ? spinner.shimmerState : undefined

  // Apply temporary options
  if (withOptions?.color !== undefined) {
    spinner.color = toRgb(withOptions.color)
  }
  if (withOptions?.shimmer !== undefined) {
    if (typeof withOptions.shimmer === 'string') {
      spinner.updateShimmer({ dir: withOptions.shimmer })
    } else {
      spinner.setShimmer(withOptions.shimmer)
    }
  }

  spinner.start(message)
  try {
    return operation()
  } finally {
    spinner.stop()
    // Restore previous options
    /* c8 ignore start */
    if (savedColor !== undefined) {
      spinner.color = savedColor
    }
    if (withOptions?.shimmer !== undefined) {
      if (savedShimmerState) {
        spinner.setShimmer({
          color: savedShimmerState.color as any,
          dir: savedShimmerState.direction,
          speed: savedShimmerState.speed,
        })
      } else {
        spinner.disableShimmer()
      }
    }
    /* c8 ignore stop */
  }
}
