/**
 * @file Lazy-loader for `node:url`. See `node/fs.ts` for the design rationale
 *   shared across all `node/*.ts` lazy-loaders.
 */

import type * as NodeUrl from 'node:url'

import { IS_NODE } from '../constants/runtime.mjs'

let cachedUrl: typeof NodeUrl | undefined

/**
 * @unused No internal or Socket consumers; exercised only by its unit tests.
 */
export function getNodeUrl(): typeof NodeUrl {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeUrl
  }
  // Bare specifier, not node:, so webpack resolve.fallback / the browser
  // field can stub this builtin in browser bundles; a node: prefix throws
  // UnhandledSchemeError there.
  // oxlint-disable-next-line unicorn/prefer-node-protocol -- browser stub
  return (cachedUrl ??= /*@__PURE__*/ require('url') as typeof NodeUrl)
}
