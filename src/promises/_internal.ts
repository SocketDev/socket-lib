/**
 * @fileoverview Private internals for `promises/*` modules — the lazy
 * `node:timers/promises` accessor + the shared abort signal. Underscore
 * prefix excludes from public exports.
 */

import { getAbortSignal } from '../constants/process'

export const abortSignal = getAbortSignal()

let _timers: typeof import('node:timers/promises') | undefined

/**
 * Get the timers/promises module.
 * Uses lazy loading to avoid Webpack bundling issues.
 *
 * @private
 * @returns The Node.js timers/promises module
 */
/*@__NO_SIDE_EFFECTS__*/
export function getTimers() {
  if (_timers === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _timers = /*@__PURE__*/ require('node:timers/promises')
  }
  return _timers as typeof import('node:timers/promises')
}
