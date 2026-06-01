/**
 * @file Lazy-loader for `node:url`. See `node/fs.ts` for the design rationale
 *   shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeUrl from 'node:url'

let cachedUrl: typeof NodeUrl | undefined

export function getNodeUrl(): typeof NodeUrl {
  return (cachedUrl ??= /*@__PURE__*/ require('node:url') as typeof NodeUrl)
}
