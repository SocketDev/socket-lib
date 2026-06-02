/**
 * @file Lazy-loader for `node:fs/promises`. See `node/fs.ts` for the design
 *   rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeFsPromises from 'node:fs/promises'

import { IS_NODE } from '../constants/runtime'

let fsPromises: typeof NodeFsPromises | undefined

export function getNodeFsPromises(): typeof NodeFsPromises | undefined {
  if (!IS_NODE) {
    return undefined
  }
  return (fsPromises ??=
    /*@__PURE__*/ require('node:fs/promises') as typeof NodeFsPromises)
}
