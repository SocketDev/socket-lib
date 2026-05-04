/**
 * @fileoverview Lazy-loader for `node:fs`.
 *
 * Bundlers (Webpack/Rollup/esbuild) targeting browsers can't statically
 * resolve `require('node:fs')` — but they CAN drop the call entirely
 * if it's wrapped in a `/*@__NO_SIDE_EFFECTS__*\/`-marked function and
 * never called. So we always go through `getFs()` instead of importing
 * top-level.
 *
 * Cache slot is module-local: first call resolves the require, every
 * subsequent call returns the cached reference.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeFs from 'node:fs'

let _fs: typeof NodeFs | undefined

/*@__NO_SIDE_EFFECTS__*/
export function getNodeFs(): typeof NodeFs {
  return (_fs ??= /*@__PURE__*/ require('node:fs') as typeof NodeFs)
}
