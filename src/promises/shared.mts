/**
 * @file Private internals for `promises/*` modules — the lazy
 *   `node:timers/promises` accessor + the shared abort signal. Underscore
 *   prefix excludes from public exports.
 */

import type timersPromises from 'node:timers/promises'

import { IS_NODE } from '../constants/runtime.mjs'

export { getAbortSignal } from '../process/abort.mjs'

/**
 * Get the timers/promises module. Uses a lazy `require` rather than a
 * top-level import to avoid Webpack bundling issues.
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
  // Bare specifier, not node:, so webpack resolve.fallback / the browser
  // field can stub this builtin in browser bundles; a node: prefix throws
  // UnhandledSchemeError there. `promises/iterate` is reachable from the
  // browser-safe `npm/meta` graph via `pEach`, so the prefix here was a real
  // browser-bundle break even though the call is IS_NODE-gated.
  // oxlint-disable-next-line unicorn/prefer-node-protocol -- browser stub
  return require('timers/promises') as typeof timersPromises
}
