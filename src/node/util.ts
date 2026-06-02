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
  return (cachedUtil ??= /*@__PURE__*/ require('node:util') as typeof NodeUtil)
}
