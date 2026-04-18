/**
 * @fileoverview Abort signal utilities.
 */

/**
 * Create a composite AbortSignal from multiple signals.
 *
 * @example
 * ```typescript
 * const ac1 = new AbortController()
 * const ac2 = new AbortController()
 * const signal = createCompositeAbortSignal(ac1.signal, ac2.signal)
 * ```
 */
export function createCompositeAbortSignal(
  ...signals: Array<AbortSignal | null | undefined>
): AbortSignal {
  const validSignals = signals.filter(s => s != null) as AbortSignal[]

  if (validSignals.length === 0) {
    return new AbortController().signal
  }

  if (validSignals.length === 1) {
    return validSignals[0]!
  }

  const controller = new AbortController()

  for (const signal of validSignals) {
    if (signal.aborted) {
      controller.abort()
      return controller.signal
    }
    signal.addEventListener('abort', () => controller.abort(), { once: true })
  }

  return controller.signal
}

/**
 * Create an AbortSignal that triggers after a timeout.
 *
 * @throws {TypeError} If `ms` is not a number, is NaN, is not finite, or is not
 *   positive.
 *
 * @example
 * ```typescript
 * const signal = createTimeoutSignal(5000) // aborts after 5 seconds
 * fetch('https://example.com', { signal })
 * ```
 */
export function createTimeoutSignal(ms: number): AbortSignal {
  if (typeof ms !== 'number' || Number.isNaN(ms)) {
    throw new TypeError('timeout must be a number')
  }
  if (!Number.isFinite(ms)) {
    throw new TypeError('timeout must be a finite number')
  }
  if (ms <= 0) {
    throw new TypeError('timeout must be a positive number')
  }
  return AbortSignal.timeout(Math.ceil(ms))
}
