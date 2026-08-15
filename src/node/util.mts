/**
 * @file Lazy-loader for `node:util`. See `node/fs.ts` for the design rationale
 *   shared across all `node/*.ts` lazy-loaders.
 */

import type * as NodeUtil from 'node:util'

import { IS_NODE } from '../constants/runtime.mjs'

let cachedUtil: typeof NodeUtil | undefined

export function getNodeUtil(): typeof NodeUtil {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeUtil
  }
  // Bare specifier, not node:, so webpack resolve.fallback / the browser
  // field can stub this builtin in browser bundles; a node: prefix throws
  // UnhandledSchemeError there.
  // oxlint-disable-next-line unicorn/prefer-node-protocol -- browser stub
  return (cachedUtil ??= /*@__PURE__*/ require('util') as typeof NodeUtil)
}
