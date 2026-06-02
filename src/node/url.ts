/**
 * @file Lazy-loader for `node:url`. See `node/fs.ts` for the design rationale
 *   shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeUrl from 'node:url'

import { IS_NODE } from '../constants/runtime'

let cachedUrl: typeof NodeUrl | undefined

export function getNodeUrl(): typeof NodeUrl {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeUrl
  }
  return (cachedUrl ??= /*@__PURE__*/ require('node:url') as typeof NodeUrl)
}
