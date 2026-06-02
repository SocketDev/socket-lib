/**
 * @file Lazy-loader for `node:fs/promises`. See `node/fs.ts` for the design
 *   rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeFsPromises from 'node:fs/promises'

import { IS_NODE } from '../constants/runtime'

let fsPromises: typeof NodeFsPromises | undefined

export function getNodeFsPromises(): typeof NodeFsPromises {
  // Non-Node path returns undefined cast so bundlers still see no
  // static `require` and tree-shake the module; Node callers (the
  // entire `src/` tree) always traverse the `IS_NODE` branch and
  // get the real module — so the type narrowing is sound in practice.
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeFsPromises
  }
  return (fsPromises ??=
    /*@__PURE__*/ require('node:fs/promises') as typeof NodeFsPromises)
}
