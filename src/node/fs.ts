/**
 * @file Lazy-loader for `node:fs`. Bundlers (Webpack/Rollup/esbuild) targeting
 *   browsers can't statically resolve `require('node:fs')` — but they CAN drop
 *   the call entirely if it's wrapped in a `/*@__NO_SIDE_EFFECTS__*\/`-marked
 *   function and never called. So we always go through `getFs()` instead of
 *   importing top-level. Cache slot is module-local: first call resolves the
 *   require, every subsequent call returns the cached reference.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeFs from 'node:fs'

import { IS_NODE } from '../constants/runtime'

let cachedFs: typeof NodeFs | undefined

export function getNodeFs(): typeof NodeFs {
  // Non-Node path returns undefined cast so bundlers still see no
  // static `require` and tree-shake the module; Node callers (the
  // entire `src/` tree) always traverse the `IS_NODE` branch and
  // get the real module — so the type narrowing is sound in practice.
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeFs
  }
  return (cachedFs ??= /*@__PURE__*/ require('node:fs') as typeof NodeFs)
}
