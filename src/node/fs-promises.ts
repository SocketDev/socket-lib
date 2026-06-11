/**
 * @file Lazy-loader for `node:fs/promises`. See `node/fs.ts` for the design
 *   rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeFsPromises from 'node:fs/promises'

import { IS_NODE } from '../constants/runtime'

let fsPromises: typeof NodeFsPromises | undefined

export function getNodeFsPromises(): typeof NodeFsPromises {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeFsPromises
  }
  return (fsPromises ??=
    // oxlint-disable-next-line unicorn/prefer-node-protocol -- bare specifier (not node:) so webpack resolve.fallback / browser-field can stub this builtin for browser bundles; node: prefix throws UnhandledSchemeError there
    /*@__PURE__*/ require('fs/promises') as typeof NodeFsPromises)
}
