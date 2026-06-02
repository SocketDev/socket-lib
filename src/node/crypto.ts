/**
 * @file Lazy-loader for `node:crypto`. See `node/fs.ts` for the design
 *   rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeCrypto from 'node:crypto'

import { IS_NODE } from '../constants/runtime'

let crypto: typeof NodeCrypto | undefined

export function getNodeCrypto(): typeof NodeCrypto | undefined {
  if (!IS_NODE) {
    return undefined
  }
  return (crypto ??= /*@__PURE__*/ require('node:crypto') as typeof NodeCrypto)
}
