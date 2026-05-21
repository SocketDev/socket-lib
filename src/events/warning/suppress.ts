/**
 * @file `process.emitWarning` suppression. Single shared wrapper installed on
 *   first call, driven by a membership Set so repeated `suppressWarningType`
 *   calls are cheap.
 */

import process from 'node:process'

import { SetCtor } from '../../primordials/map-set'
import { ReflectApply } from '../../primordials/reflect'

// Store the original emitWarning function to avoid repeat wrapping.
let originalEmitWarning: typeof process.emitWarning | undefined

// Track which warning types are currently suppressed.
const suppressedWarnings = new SetCtor<string>()

/**
 * Restore the original process.emitWarning function. Call this to re-enable all
 * warnings after suppressing them.
 *
 * @example
 *   ;```typescript
 *   suppressMaxListenersWarning()
 *   // ... do work ...
 *   restoreWarnings() // Re-enable all warnings
 *   ```
 */
export function restoreWarnings(): void {
  if (originalEmitWarning) {
    process.emitWarning = originalEmitWarning
    originalEmitWarning = undefined
    suppressedWarnings.clear()
  }
}

/**
 * Internal function to set up warning suppression. Only wraps
 * process.emitWarning once, regardless of how many times it's called.
 */
export function setupSuppression(): void {
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
 * Silence `MaxListenersExceededWarning` messages from `process.emitWarning`.
 * Installs a single shared wrapper around `process.emitWarning` on first call
 * so repeat invocations are cheap.
 *
 * @example
 *   import { suppressMaxListenersWarning } from '@socketsecurity/lib/events/warning/suppress'
 *
 *   suppressMaxListenersWarning()
 */
export function suppressMaxListenersWarning(): void {
  suppressedWarnings.add('MaxListenersExceededWarning')
  setupSuppression()
}

/**
 * Suppress all process warnings of a specific type.
 *
 * @example
 *   import { suppressWarningType } from '@socketsecurity/lib/events/warning/suppress'
 *
 *   suppressWarningType('ExperimentalWarning')
 *
 * @param warningType - The warning type to suppress (e.g.,
 *   'DeprecationWarning', 'ExperimentalWarning')
 */
export function suppressWarningType(warningType: string): void {
  suppressedWarnings.add(warningType)
  setupSuppression()
}

/**
 * Suppress warnings temporarily within a callback.
 *
 * @example
 *   import { withSuppressedWarnings } from '@socketsecurity/lib/events/warning/suppress'
 *
 *   const result = await withSuppressedWarnings(
 *     'ExperimentalWarning',
 *     async () => {
 *       // Code that triggers experimental warnings
 *       return someValue
 *     },
 *   )
 *
 * @param warningType - The warning type to suppress.
 * @param callback - Function to execute with warnings suppressed.
 *
 * @returns The result of the callback
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
