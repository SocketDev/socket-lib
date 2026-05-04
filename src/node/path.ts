/**
 * @fileoverview Lazy-loader for `node:path`. See `node/fs.ts` for the
 * design rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodePath from 'node:path'

let _path: typeof NodePath | undefined

/*@__NO_SIDE_EFFECTS__*/
export function getNodePath(): typeof NodePath {
  return (_path ??= /*@__PURE__*/ require('node:path') as typeof NodePath)
}
