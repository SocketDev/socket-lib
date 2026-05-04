/**
 * @fileoverview Lazy-loader for `node:http`. See `node/fs.ts` for
 * the design rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeHttp from 'node:http'

let _http: typeof NodeHttp | undefined

/*@__NO_SIDE_EFFECTS__*/
export function getNodeHttp(): typeof NodeHttp {
  return (_http ??= /*@__PURE__*/ require('node:http') as typeof NodeHttp)
}
