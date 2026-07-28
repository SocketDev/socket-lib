/**
 * @file Lazy-loader for `node:events`. See `node/fs.ts` for the design
 *   rationale shared across all `node/*.ts` lazy-loaders.
 */

import type * as NodeEvents from 'node:events'

import { IS_NODE } from '../constants/runtime'

let events: typeof NodeEvents | undefined

/**
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export function getNodeEvents(): typeof NodeEvents {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeEvents
  }
  // oxlint-disable-next-line unicorn/prefer-node-protocol -- bare specifier (not node:) so webpack resolve.fallback / browser-field can stub this builtin for browser bundles; node: prefix throws UnhandledSchemeError there
  return (events ??= /*@__PURE__*/ require('events') as typeof NodeEvents)
}
