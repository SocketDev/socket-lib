/**
 * @file Lazy-loader for `node:os`. See `node/fs.ts` for the design rationale
 *   shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeOs from 'node:os'

import { IS_NODE } from '../constants/runtime'

let cachedOs: typeof NodeOs | undefined

export function getNodeOs(): typeof NodeOs {
  // Non-Node path returns undefined cast so bundlers still see no
  // static `require` and tree-shake the module; Node callers (the
  // entire `src/` tree) always traverse the `IS_NODE` branch and
  // get the real module — so the type narrowing is sound in practice.
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeOs
  }
  return (cachedOs ??= /*@__PURE__*/ require('node:os') as typeof NodeOs)
}
