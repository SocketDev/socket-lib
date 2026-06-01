/**
 * @file Lazy-loader for `node:crypto`. See `node/fs.ts` for the design
 *   rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeCrypto from 'node:crypto'

let crypto: typeof NodeCrypto | undefined

export function getNodeCrypto(): typeof NodeCrypto {
  return (crypto ??= /*@__PURE__*/ require('node:crypto') as typeof NodeCrypto)
}
