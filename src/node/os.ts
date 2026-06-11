/**
 * @file Lazy-loader for `node:os`. See `node/fs.ts` for the design rationale
 *   shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeOs from 'node:os'

import { IS_NODE } from '../constants/runtime'

let cachedOs: typeof NodeOs | undefined

export function getNodeOs(): typeof NodeOs {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeOs
  }
  // oxlint-disable-next-line unicorn/prefer-node-protocol -- bare specifier (not node:) so webpack resolve.fallback / browser-field can stub this builtin for browser bundles; node: prefix throws UnhandledSchemeError there
  return (cachedOs ??= /*@__PURE__*/ require('os') as typeof NodeOs)
}
