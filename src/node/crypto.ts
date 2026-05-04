/**
 * @fileoverview Lazy-loader for `node:crypto`. See `node/fs.ts` for
 * the design rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeCrypto from 'node:crypto'

let _crypto: typeof NodeCrypto | undefined

/*@__NO_SIDE_EFFECTS__*/
export function getNodeCrypto(): typeof NodeCrypto {
  return (_crypto ??= /*@__PURE__*/ require('node:crypto') as typeof NodeCrypto)
}
