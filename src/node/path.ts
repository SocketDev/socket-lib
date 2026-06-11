/**
 * @file Early-snapshot accessor for `node:path`. See `node/fs.ts` for the
 *   shared rationale: the `require` runs at module load behind the runtime
 *   `IS_NODE` guard (false in browsers → never executes there), giving a
 *   load-time snapshot in Node while staying browser-safe.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodePath from 'node:path'

import { IS_NODE } from '../constants/runtime'

// oxlint-disable-next-line unicorn/prefer-node-protocol -- bare specifier (not node:) so webpack resolve.fallback / browser-field can stub this builtin for browser bundles; node: prefix throws UnhandledSchemeError there
const nodePath = IS_NODE ? /*@__PURE__*/ require('path') : undefined

export function getNodePath(): typeof NodePath {
  return nodePath as typeof NodePath
}
