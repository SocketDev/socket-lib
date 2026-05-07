/**
 * @fileoverview Utilities to suppress specific process warnings.
 */

import process from 'node:process'

import {
  ObjectGetOwnPropertySymbols,
  ReflectApply,
  SetCtor,
} from './primordials'

// Store the original emitWarning function to avoid repeat wrapping.
let originalEmitWarning: typeof process.emitWarning | undefined

// Track which warning types are currently suppressed.
const suppressedWarnings = new SetCtor<string>()

/**
 * Internal function to set up warning suppression.
 * Only wraps process.emitWarning once, regardless of how many times it's called.
 */
function setupSuppression(): void {
  // Only wrap once - store the original on first call.
  // First-call init only fires once per process; subsequent calls
  // hit the second-call no-op branch.
  /* c8 ignore start */
  if (!originalEmitWarning) {
    originalEmitWarning = process.emitWarning
    process.emitWarning = (warning: string | Error, ...args: unknown[]) => {
      if (typeof warning === 'string') {
        for (const suppressedType of suppressedWarnings) {
          if (warning.includes(suppressedType)) {
            return
          }
        }
      } else if (warning && typeof warning === 'object') {
        /* c8 ignore start - Object-shaped warning suppression
           (Error / Warning instances). process.emitWarning rarely
           passes object form in test runs; covered when consumers
           pass real Warning subclasses. */
        const warningObj = warning as { name?: string }
        if (warningObj.name && suppressedWarnings.has(warningObj.name)) {
          return
        }
        /* c8 ignore stop */
      }
      // Not suppressed - call the original function.
      return ReflectApply(
        originalEmitWarning as typeof process.emitWarning,
        process,
        [warning, ...args],
      )
    }
  }
  /* c8 ignore stop */
}

/**
 * Restore the original process.emitWarning function.
 * Call this to re-enable all warnings after suppressing them.
 *
 * @example
 * ```typescript
 * suppressMaxListenersWarning()
 * // ... do work ...
 * restoreWarnings() // Re-enable all warnings
 * ```
 */
export function restoreWarnings(): void {
  if (originalEmitWarning) {
    process.emitWarning = originalEmitWarning
    originalEmitWarning = undefined
    suppressedWarnings.clear()
  }
}

/**
 * Set max listeners on an EventTarget (like AbortSignal) to avoid TypeError.
 *
 * By manually setting `kMaxEventTargetListeners` on the target we avoid:
 *   TypeError [ERR_INVALID_ARG_TYPE]: The "emitter" argument must be an
 *   instance of EventEmitter or EventTarget. Received an instance of
 *   AbortSignal
 *
 * in some patch releases of Node 18-23 when calling events.getMaxListeners().
 * See https://github.com/nodejs/node/pull/56807.
 *
 * Instead of calling events.setMaxListeners(n, target) we set the symbol
 * property directly to avoid depending on 'node:events' module.
 *
 * @param target - The EventTarget or AbortSignal to configure
 * @param maxListeners - Maximum number of listeners (defaults to 10, the Node.js default)
 *
 * @example
 * import { setMaxEventTargetListeners } from '@socketsecurity/lib/suppress-warnings'
 *
 * const controller = new AbortController()
 * setMaxEventTargetListeners(controller.signal)
 */
export function setMaxEventTargetListeners(
  target: EventTarget | AbortSignal | undefined,
  maxListeners: number = 10,
): void {
  // !target arm fires for caller-passes-undefined; symbol-not-found
  // arm fires only on Node runtimes that don't expose the symbol.
  /* c8 ignore start */
  if (!target) {
    return
  }
  const symbols = ObjectGetOwnPropertySymbols(target)
  const kMaxEventTargetListeners = symbols.find(
    s => s.description === 'events.maxEventTargetListeners',
  )
  if (kMaxEventTargetListeners) {
    ;(target as unknown as Record<symbol, number>)[kMaxEventTargetListeners] =
      maxListeners
  }
  /* c8 ignore stop */
}

/**
 * Suppress MaxListenersExceededWarning messages.
 * This is useful in tests or scripts where multiple listeners are expected.
 *
 * @example
 * import { suppressMaxListenersWarning } from '@socketsecurity/lib/suppress-warnings'
 *
 * suppressMaxListenersWarning()
 */
/**
 * Silence `MaxListenersExceededWarning` messages from `process.emitWarning`.
 * Installs a single shared wrapper around `process.emitWarning` on first call
 * so repeat invocations are cheap.
 */
export function suppressMaxListenersWarning(): void {
  suppressedWarnings.add('MaxListenersExceededWarning')
  setupSuppression()
}

/**
 * Suppress all process warnings of a specific type.
 *
 * @param warningType - The warning type to suppress (e.g., 'DeprecationWarning', 'ExperimentalWarning')
 *
 * @example
 * import { suppressWarningType } from '@socketsecurity/lib/suppress-warnings'
 *
 * suppressWarningType('ExperimentalWarning')
 */
export function suppressWarningType(warningType: string): void {
  suppressedWarnings.add(warningType)
  setupSuppression()
}

/**
 * Suppress warnings temporarily within a callback.
 *
 * @param warningType - The warning type to suppress
 * @param callback - Function to execute with warnings suppressed
 * @returns The result of the callback
 *
 * @example
 * import { withSuppressedWarnings } from '@socketsecurity/lib/suppress-warnings'
 *
 * const result = await withSuppressedWarnings('ExperimentalWarning', async () => {
 *   // Code that triggers experimental warnings
 *   return someValue
 * })
 */
export async function withSuppressedWarnings<T>(
  warningType: string,
  callback: () => T | Promise<T>,
): Promise<T> {
  const wasAlreadySuppressed = suppressedWarnings.has(warningType)
  suppressWarningType(warningType)
  try {
    return await callback()
  } finally {
    // The wrapper is driven by `suppressedWarnings` membership, so
    // removing this type from the set is enough to stop suppressing it.
    // Do NOT reassign `process.emitWarning` here: snapshotting the
    // previous value at the top would either (a) capture the native
    // function when the wrapper was already installed and then restore
    // native — wiping every other active suppression — or (b) be the
    // wrapper itself, in which case the restore is a no-op anyway.
    if (!wasAlreadySuppressed) {
      suppressedWarnings.delete(warningType)
    }
  }
}
