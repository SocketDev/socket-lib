/**
 * @file Lazy-loader for `node:async_hooks`. See `node/fs.ts` for the design
 *   rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeAsyncHooks from 'node:async_hooks'

import { IS_NODE } from '../constants/runtime'

let asyncHooks: typeof NodeAsyncHooks | undefined

export function getNodeAsyncHooks(): typeof NodeAsyncHooks {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeAsyncHooks
  }
  return (asyncHooks ??=
    // oxlint-disable-next-line unicorn/prefer-node-protocol -- bare specifier (not node:) so webpack resolve.fallback / browser-field can stub this builtin for browser bundles; node: prefix throws UnhandledSchemeError there
    /*@__PURE__*/ require('async_hooks') as typeof NodeAsyncHooks)
}
