/**
 * @fileoverview Lazy-loader for `node:util`. See `node/fs.ts` for
 * the design rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeUtil from 'node:util'

let _util: typeof NodeUtil | undefined

/*@__NO_SIDE_EFFECTS__*/
export function getNodeUtil(): typeof NodeUtil {
  return (_util ??= /*@__PURE__*/ require('node:util') as typeof NodeUtil)
}
