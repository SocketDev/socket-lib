/**
 * @file Lazy-loader for `node:crypto`. See `node/fs.ts` for the design
 *   rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeCrypto from 'node:crypto'

import { IS_NODE } from '../constants/runtime'

let crypto: typeof NodeCrypto | undefined

export function getNodeCrypto(): typeof NodeCrypto {
  // Non-Node path returns undefined cast so bundlers still see no
  // static `require` and tree-shake the module; Node callers (the
  // entire `src/` tree) always traverse the `IS_NODE` branch and
  // get the real module — so the type narrowing is sound in practice.
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeCrypto
  }
  return (crypto ??= /*@__PURE__*/ require('node:crypto') as typeof NodeCrypto)
}
