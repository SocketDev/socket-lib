/**
 * @file Lazy-loader for `node:async_hooks`. See `node/fs.ts` for the design
 *   rationale shared across all `node/*.ts` lazy-loaders.
 */

import type * as NodeAsyncHooks from 'node:async_hooks'

import { IS_NODE } from '../constants/runtime.mjs'

let asyncHooks: typeof NodeAsyncHooks | undefined

export function getNodeAsyncHooks(): typeof NodeAsyncHooks {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeAsyncHooks
  }
  // Bare specifier, not node:, so webpack resolve.fallback / the browser
  // field can stub this builtin in browser bundles; a node: prefix throws
  // UnhandledSchemeError there.
  // oxlint-disable-next-line unicorn/prefer-node-protocol -- browser stub
  asyncHooks ??= /*@__PURE__*/ require('async_hooks')
  return asyncHooks as typeof NodeAsyncHooks
}
