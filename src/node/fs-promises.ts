/**
 * @fileoverview Lazy-loader for `node:fs/promises`. See `node/fs.ts`
 * for the design rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeFsPromises from 'node:fs/promises'

let _fsPromises: typeof NodeFsPromises | undefined

/*@__NO_SIDE_EFFECTS__*/
export function getNodeFsPromises(): typeof NodeFsPromises {
  return (_fsPromises ??=
    /*@__PURE__*/ require('node:fs/promises') as typeof NodeFsPromises)
}
