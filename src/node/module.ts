/**
 * @file Lazy-loader for `node:module`. See `node/fs.ts` for the design
 *   rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeModule from 'node:module'

let _module: typeof NodeModule | undefined

/*@__NO_SIDE_EFFECTS__*/
export function getNodeModule(): typeof NodeModule {
  return (_module ??= /*@__PURE__*/ require('node:module') as typeof NodeModule)
}

/**
 * Lazy + cached reference to `node:module`'s `isBuiltin(name)`. First call
 * resolves the binding; subsequent calls dispatch through the cached function
 * reference. Safe to detach — `isBuiltin` is `this`-free.
 *
 * Single source of truth for "is this a Node builtin?" probes across socket-lib
 * (used by the smol-binding loaders to gate `require('node:smol-*')`).
 */
let _isBuiltin: ((name: string) => boolean) | undefined
/*@__NO_SIDE_EFFECTS__*/
export function isNodeBuiltin(name: string): boolean {
  return (_isBuiltin ??= getNodeModule().isBuiltin)(name)
}
