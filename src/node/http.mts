/**
 * @file Lazy-loader for `node:http`. See `node/fs.ts` for the design rationale
 *   shared across all `node/*.ts` lazy-loaders.
 */

import type * as NodeHttp from 'node:http'

import { IS_NODE } from '../constants/runtime.mjs'

let cachedHttp: typeof NodeHttp | undefined

export function getNodeHttp(): typeof NodeHttp {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeHttp
  }
  // Bare specifier, not node:, so webpack resolve.fallback / the browser
  // field can stub this builtin in browser bundles; a node: prefix throws
  // UnhandledSchemeError there.
  // oxlint-disable-next-line unicorn/prefer-node-protocol -- browser stub
  return (cachedHttp ??= /*@__PURE__*/ require('http') as typeof NodeHttp)
}
