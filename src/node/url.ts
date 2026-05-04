/**
 * @fileoverview Lazy-loader for `node:url`. See `node/fs.ts` for
 * the design rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeUrl from 'node:url'

let _url: typeof NodeUrl | undefined

/*@__NO_SIDE_EFFECTS__*/
export function getNodeUrl(): typeof NodeUrl {
  return (_url ??= /*@__PURE__*/ require('node:url') as typeof NodeUrl)
}
