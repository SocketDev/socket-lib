/**
 * @fileoverview Lazy-loader for `node:module`. See `node/fs.ts` for
 * the design rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeModule from 'node:module'

let _module: typeof NodeModule | undefined

/*@__NO_SIDE_EFFECTS__*/
export function getNodeModule(): typeof NodeModule {
  return (_module ??= /*@__PURE__*/ require('node:module') as typeof NodeModule)
}
