/**
 * @fileoverview Lazy-loader for socket-btm's `node:smol-util` binding.
 *
 * `node:smol-util` provides native `uncurryThis` and `applyBind` —
 * single V8 dispatch via `args.Data()` + `v8::Function::Call`,
 * skipping the BoundFunction adapter + `Function.prototype.call`
 * trampoline that the JS form (`bind.bind(call)(fn)`) hits twice
 * per invocation. ~2x faster on hot uncurried-call sites.
 *
 * Returns `undefined` on stock Node + non-Node runtimes. Result is
 * cached across calls; the lazy-loader follows the same shape as
 * `src/node/fs.ts` etc.
 *
 * @internal — used by `src/primordials.ts` to resolve smol-aware
 *   `uncurryThis` / `applyBind`. Most callers should use the standard
 *   `primordials` exports, which already route through this when smol
 *   is present.
 */

import { isSmol } from './detect'

/**
 * Surface of `node:smol-util`. See socket-btm's
 * additions/source-patched/lib/smol-util.js for the canonical shape.
 */
export interface SmolUtilBinding {
  /**
   * Native equivalent of `Function.prototype.bind.bind(call)(fn)`.
   * Single C++ dispatch via `args.Data()` + `v8::Function::Call`.
   */
  uncurryThis: <T, A extends readonly unknown[], R>(
    fn: (this: T, ...args: A) => R,
  ) => (self: T, ...args: A) => R
  /**
   * Native equivalent of `Function.prototype.bind.bind(apply)(fn)`.
   */
  applyBind: <T, A extends readonly unknown[], R>(
    fn: (this: T, ...args: A) => R,
  ) => (self: T, args: A) => R
}

/**
 * Cached `node:smol-util` binding. `null` = probed and unavailable;
 * `undefined` = not yet probed. JS truthiness collapses both to "no
 * binding" at the call site.
 */
let _smolUtil: SmolUtilBinding | null | undefined

/**
 * Returns `node:smol-util` when running on the smol Node binary,
 * otherwise `undefined`. Result is cached across calls.
 *
 * @see https://github.com/SocketDev/socket-btm — socket-btm builds
 *   the smol binary that exposes this binding.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getSmolUtil(): SmolUtilBinding | undefined {
  if (_smolUtil === undefined) {
    if (isSmol()) {
      try {
        _smolUtil = require('node:smol-util') as SmolUtilBinding
      } catch {
        _smolUtil = null
      }
    } else {
      _smolUtil = null
    }
  }
  return _smolUtil ?? undefined
}
