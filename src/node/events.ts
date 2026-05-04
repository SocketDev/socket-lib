/**
 * @fileoverview Lazy-loader for `node:events`. See `node/fs.ts` for
 * the design rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeEvents from 'node:events'

let _events: typeof NodeEvents | undefined

/*@__NO_SIDE_EFFECTS__*/
export function getNodeEvents(): typeof NodeEvents {
  return (_events ??= /*@__PURE__*/ require('node:events') as typeof NodeEvents)
}
