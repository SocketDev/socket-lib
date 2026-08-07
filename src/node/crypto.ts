/**
 * @file Lazy-loader for `node:crypto`. See `node/fs.ts` for the design
 *   rationale shared across all `node/*.ts` lazy-loaders.
 */

import type * as NodeCrypto from 'node:crypto'

import { IS_NODE } from '../constants/runtime'

let crypto: typeof NodeCrypto | undefined

export function getNodeCrypto(): typeof NodeCrypto {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeCrypto
  }
  // Bare specifier, not node:, so webpack resolve.fallback / the browser
  // field can stub this builtin in browser bundles; a node: prefix throws
  // UnhandledSchemeError there.
  // oxlint-disable-next-line unicorn/prefer-node-protocol -- browser stub
  return (crypto ??= /*@__PURE__*/ require('crypto') as typeof NodeCrypto)
}
