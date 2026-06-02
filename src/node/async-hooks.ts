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
    /*@__PURE__*/ require('node:async_hooks') as typeof NodeAsyncHooks)
}
