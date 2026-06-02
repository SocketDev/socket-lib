/**
 * @file Lazy-loader for `node:module`. See `node/fs.ts` for the design
 *   rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeModule from 'node:module'

import { IS_NODE } from '../constants/runtime'

let cachedModule: typeof NodeModule | undefined

export function getNodeModule(): typeof NodeModule {
  // Skip in browser / non-Node runtimes — `node:module` is not available
  // there and the static require() call would throw at runtime or produce an
  // UNRESOLVED_IMPORT warning when a browser bundler walks the call.
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeModule
  }
  return (cachedModule ??=
    /*@__PURE__*/ require('node:module') as typeof NodeModule)
}

/**
 * Lazy + cached reference to `node:module`'s `isBuiltin(name)`. First call
 * resolves the binding; subsequent calls dispatch through the cached function
 * reference. Safe to detach — `isBuiltin` is `this`-free.
 *
 * Returns `false` in browser / non-CJS environments where `require` is
 * undefined — no `node:` modules are built-in there.
 *
 * Single source of truth for "is this a Node builtin?" probes across socket-lib
 * (used by the smol-binding loaders to gate `require('node:smol-*')`).
 */
let cachedIsBuiltin: ((name: string) => boolean) | undefined
export function isNodeBuiltin(name: string): boolean {
  if (!IS_NODE) {
    return false
  }
  return (cachedIsBuiltin ??= getNodeModule()!.isBuiltin)(name)
}
