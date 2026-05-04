/**
 * @fileoverview Smol detection + lazy-loader for `node:smol-util`.
 *
 * Two responsibilities:
 *
 *   1. `isSmol()` — memoized boolean detector for socket-btm's smol
 *      Node binary. Mirrors `isSeaBinary()` from `src/sea.ts`. Probes
 *      via `node:module.isBuiltin('node:smol-util')` since only the
 *      smol binary registers any `node:smol-*` builtins.
 *
 *   2. `getSmolUtil()` — lazy-loader for the `node:smol-util` binding,
 *      which provides native `uncurryThis` and `applyBind` (single
 *      V8 dispatch via `args.Data()` + `v8::Function::Call`, skipping
 *      the BoundFunction adapter + `Function.prototype.call` trampoline
 *      that the JS form `bind.bind(call)(fn)` hits twice per invocation).
 *      ~2x faster on hot uncurried-call sites.
 *
 * `getSmolUtil()` returns `undefined` on stock Node + non-Node
 * runtimes. Result is cached across calls; the lazy-loader follows
 * the same shape as `src/node/fs.ts` etc.
 *
 * @see https://github.com/SocketDev/socket-btm — socket-btm builds
 *   the smol binary that exposes the `node:smol-util` binding.
 */

// ─── isSmol ────────────────────────────────────────────────────────────

/**
 * Cached smol-binary detection result.
 */
let _isSmol: boolean | undefined

/**
 * Detect if the current process is running on socket-btm's smol Node
 * binary. Memoized on first call.
 *
 * Defensive across runtimes: returns `false` on stock Node, browsers
 * (no `node:module`), Deno / Bun (different module resolution), and
 * worker threads (each has its own builtin table).
 *
 * @example
 * ```ts
 * import { isSmol } from '@socketsecurity/lib/smol/util'
 *
 * if (isSmol()) {
 *   // running on the smol binary; native fast paths available
 * }
 * ```
 */
export function isSmol(): boolean {
  if (_isSmol === undefined) {
    try {
      // eslint-disable-next-line n/prefer-node-protocol
      const mod = require('node:module') as {
        isBuiltin?: (name: string) => boolean
      }
      _isSmol =
        typeof mod.isBuiltin === 'function' && mod.isBuiltin('node:smol-util')
    } catch {
      // Not Node, or `node:module` unavailable.
      _isSmol = false
    }
  }
  return _isSmol ?? false
}

// ─── getSmolUtil ───────────────────────────────────────────────────────

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
