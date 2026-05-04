/**
 * @fileoverview Lazy-loader for `node:timers/promises`. See `node/fs.ts`
 * for the design rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeTimersPromises from 'node:timers/promises'

let _timersPromises: typeof NodeTimersPromises | undefined

/*@__NO_SIDE_EFFECTS__*/
export function getNodeTimersPromises(): typeof NodeTimersPromises {
  return (_timersPromises ??=
    /*@__PURE__*/ require('node:timers/promises') as typeof NodeTimersPromises)
}
