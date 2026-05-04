/**
 * @fileoverview Detection helper for socket-btm's smol Node binary.
 *
 * Mirrors the shape of `src/sea.ts`: a memoized boolean detector
 * answering "am I running on the smol binary?". Same convention as
 * `isSeaBinary()`.
 *
 * The probe checks for `node:smol-util` in the static builtin table
 * via `node:module`'s `isBuiltin()`. Both the smol binary and stock
 * Node have `node:module`, but only the smol binary registers any
 * `node:smol-*` builtins.
 *
 * Defensive across runtimes: works on stock Node (returns false),
 * browsers (no `node:module`), Deno / Bun (different module
 * resolution), and worker threads (each has its own builtin table).
 */

let _isSmol: boolean | undefined

/**
 * Detect if the current process is running on socket-btm's smol Node
 * binary. Memoized on first call.
 *
 * @example
 * ```ts
 * import { isSmol } from '@socketsecurity/lib/smol/detect'
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
