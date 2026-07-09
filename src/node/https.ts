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
  return (cachedHttps ??=
    // oxlint-disable-next-line unicorn/prefer-node-protocol -- bare specifier (not node:) so webpack resolve.fallback / browser-field can stub this builtin for browser bundles; node: prefix throws UnhandledSchemeError there
    /*@__PURE__*/ require('https') as typeof NodeHttps)
}
