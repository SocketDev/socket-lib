/**
 * @file Private internals for `promises/*` modules — the lazy
 *   `node:timers/promises` accessor + the shared abort signal. Underscore
 *   prefix excludes from public exports.
 */

import type timersPromises from 'node:timers/promises'

import { IS_NODE } from '../constants/runtime'

export { getAbortSignal } from '../process/abort'

/**
 * Get the timers/promises module. Lazy `require` (not a top-level import) to
 * avoid Webpack bundling issues.
 *
 * Intentionally NOT memoized: Node's module cache already makes the repeat
 * `require` effectively free, and caching the reference breaks fake timers
 * (`vi.useFakeTimers()` swaps the clock after this module loads; a cached
 * reference would hold the pre-fake real `setTimeout`, burning real wallclock
 * on retry backoff and starving the test worker pool).
 *
 * @private
 *
 * @returns The Node.js timers/promises module
 */
export function getTimers(): typeof timersPromises {
  if (!IS_NODE) {
    return undefined as unknown as typeof timersPromises
  }
  return require('node:timers/promises') as typeof timersPromises
}
