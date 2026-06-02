/**
 * @file Lazy-loader for `node:path`. See `node/fs.ts` for the design rationale
 *   shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodePath from 'node:path'

import { IS_NODE } from '../constants/runtime'

let cachedPath: typeof NodePath | undefined

export function getNodePath(): typeof NodePath {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodePath
  }
  return (cachedPath ??= /*@__PURE__*/ require('node:path') as typeof NodePath)
}
