/**
 * @fileoverview Lazy-loader for `node:async_hooks`. See `node/fs.ts`
 * for the design rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeAsyncHooks from 'node:async_hooks'

let _asyncHooks: typeof NodeAsyncHooks | undefined

/*@__NO_SIDE_EFFECTS__*/
export function getNodeAsyncHooks(): typeof NodeAsyncHooks {
  return (_asyncHooks ??=
    /*@__PURE__*/ require('node:async_hooks') as typeof NodeAsyncHooks)
}
