/**
 * @fileoverview Lazy-loader for `node:https`. See `node/fs.ts` for
 * the design rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeHttps from 'node:https'

let _https: typeof NodeHttps | undefined

/*@__NO_SIDE_EFFECTS__*/
export function getNodeHttps(): typeof NodeHttps {
  return (_https ??= /*@__PURE__*/ require('node:https') as typeof NodeHttps)
}
