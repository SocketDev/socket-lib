/**
 * @file Lazy-loader for `node:util`. See `node/fs.ts` for the design rationale
 *   shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeUtil from 'node:util'

import { IS_NODE } from '../constants/runtime'

let cachedUtil: typeof NodeUtil | undefined

export function getNodeUtil(): typeof NodeUtil {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeUtil
  }
  // oxlint-disable-next-line unicorn/prefer-node-protocol -- bare specifier (not node:) so webpack resolve.fallback / browser-field can stub this builtin for browser bundles; node: prefix throws UnhandledSchemeError there
  return (cachedUtil ??= /*@__PURE__*/ require('util') as typeof NodeUtil)
}
