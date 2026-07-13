/**
 * @file Lazy-loader for `node:url`. See `node/fs.ts` for the design rationale
 *   shared across all `node/*.ts` lazy-loaders.
 */

import type * as NodeUrl from 'node:url'

import { IS_NODE } from '../constants/runtime'

let cachedUrl: typeof NodeUrl | undefined

/**
 * @unused No internal or Socket consumers (exercised only by its unit tests).
 */
export function getNodeUrl(): typeof NodeUrl {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeUrl
  }
  // oxlint-disable-next-line unicorn/prefer-node-protocol -- bare specifier (not node:) so webpack resolve.fallback / browser-field can stub this builtin for browser bundles; node: prefix throws UnhandledSchemeError there
  return (cachedUrl ??= /*@__PURE__*/ require('url') as typeof NodeUrl)
}
