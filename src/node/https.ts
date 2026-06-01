/**
 * @file Lazy-loader for `node:https`. See `node/fs.ts` for the design rationale
 *   shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeHttps from 'node:https'

let cachedHttps: typeof NodeHttps | undefined

export function getNodeHttps(): typeof NodeHttps {
  return (cachedHttps ??= /*@__PURE__*/ require('node:https') as typeof NodeHttps)
}
