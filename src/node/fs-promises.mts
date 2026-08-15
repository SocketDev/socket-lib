/**
 * @file Lazy-loader for `node:fs/promises`. See `node/fs.ts` for the design
 *   rationale shared across all `node/*.ts` lazy-loaders.
 */

import type * as NodeFsPromises from 'node:fs/promises'

import { IS_NODE } from '../constants/runtime.mjs'

let fsPromises: typeof NodeFsPromises | undefined

export function getNodeFsPromises(): typeof NodeFsPromises {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeFsPromises
  }
  // Bare specifier, not node:, so webpack resolve.fallback / the browser
  // field can stub this builtin in browser bundles; a node: prefix throws
  // UnhandledSchemeError there.
  // oxlint-disable-next-line unicorn/prefer-node-protocol -- browser stub
  fsPromises ??= /*@__PURE__*/ require('fs/promises')
  return fsPromises as typeof NodeFsPromises
}
