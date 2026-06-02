/**
 * @file Lazy-loader for `node:https`. See `node/fs.ts` for the design rationale
 *   shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeHttps from 'node:https'

import { IS_NODE } from '../constants/runtime'

let cachedHttps: typeof NodeHttps | undefined

export function getNodeHttps(): typeof NodeHttps {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeHttps
  }
  return (cachedHttps ??=
    /*@__PURE__*/ require('node:https') as typeof NodeHttps)
}
