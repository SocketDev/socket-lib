/**
 * @file Lazy-loader for `node:timers/promises`. See `node/fs.ts` for the design
 *   rationale shared across all `node/*.ts` lazy-loaders.
 */

import type * as NodeTimersPromises from 'node:timers/promises'

import { IS_NODE } from '../constants/runtime.mjs'

let timersPromises: typeof NodeTimersPromises | undefined

/**
 * @unused No internal or Socket consumers; only its unit tests exercise it.
 */
export function getNodeTimersPromises(): typeof NodeTimersPromises {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeTimersPromises
  }
  // Bare specifier, not node:, so webpack resolve.fallback / the browser
  // field can stub this builtin in browser bundles; a node: prefix throws
  // UnhandledSchemeError there.
  // oxlint-disable-next-line unicorn/prefer-node-protocol -- browser stub
  timersPromises ??= /*@__PURE__*/ require('timers/promises')
  return timersPromises as typeof NodeTimersPromises
}
