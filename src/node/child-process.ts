/**
 * @file Lazy-loader for `node:child_process`. See `node/fs.ts` for the design
 *   rationale shared across all `node/*.ts` lazy-loaders. Filename uses
 *   `child-process` (kebab-case) to match the rest of socket-lib's filename
 *   convention. The exported getter name is `getNodeChildProcess` (camelCase,
 *   prefixed with `Node` to match every other `node/*` lazy-loader).
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeChildProcess from 'node:child_process'

import { IS_NODE } from '../constants/runtime'

let childProcess: typeof NodeChildProcess | undefined

export function getNodeChildProcess(): typeof NodeChildProcess {
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeChildProcess
  }
  return (childProcess ??=
    // oxlint-disable-next-line unicorn/prefer-node-protocol -- bare specifier (not node:) so webpack resolve.fallback / browser-field can stub this builtin for browser bundles; node: prefix throws UnhandledSchemeError there
    /*@__PURE__*/ require('child_process') as typeof NodeChildProcess)
}
