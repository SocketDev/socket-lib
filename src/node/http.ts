/**
 * @file Lazy-loader for `node:http`. See `node/fs.ts` for the design rationale
 *   shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeHttp from 'node:http'

import { IS_NODE } from '../constants/runtime'

let cachedHttp: typeof NodeHttp | undefined

export function getNodeHttp(): typeof NodeHttp {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeHttp
  }
  // oxlint-disable-next-line unicorn/prefer-node-protocol -- bare specifier (not node:) so webpack resolve.fallback / browser-field can stub this builtin for browser bundles; node: prefix throws UnhandledSchemeError there
  return (cachedHttp ??= /*@__PURE__*/ require('http') as typeof NodeHttp)
}
