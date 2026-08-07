/**
 * @file Lazy-loader for `node:https`. See `node/fs.ts` for the design rationale
 *   shared across all `node/*.ts` lazy-loaders.
 */

import type * as NodeHttps from 'node:https'

import { IS_NODE } from '../constants/runtime'

let cachedHttps: typeof NodeHttps | undefined

export function getNodeHttps(): typeof NodeHttps {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeHttps
  }
  // Bare specifier, not node:, so webpack resolve.fallback / the browser
  // field can stub this builtin in browser bundles; a node: prefix throws
  // UnhandledSchemeError there.
  // oxlint-disable-next-line unicorn/prefer-node-protocol -- browser stub
  cachedHttps ??= /*@__PURE__*/ require('https')
  return cachedHttps as typeof NodeHttps
}
