/**
 * @file Early-snapshot accessor for `node:process`. See `node/fs.ts` for the
 *   shared rationale: the `require` runs at module load behind the runtime
 *   `IS_NODE` guard (false in browsers → never executes there), giving a
 *   load-time snapshot in Node while staying browser-safe. `getNodeProcess()`
 *   returns the module object for a late, spy-able property lookup, which is
 *   what a test needs to stand in a different pid, platform, or env.
 */

import type * as NodeProcess from 'node:process'

import { IS_NODE } from '../constants/runtime.mjs'

// Bare specifier, not node:, so webpack resolve.fallback / the browser field
// can stub this builtin in browser bundles; a node: prefix throws
// UnhandledSchemeError there.
// oxlint-disable-next-line unicorn/prefer-node-protocol -- browser stub
const nodeProcess = IS_NODE ? /*@__PURE__*/ require('process') : undefined

export function getNodeProcess(): typeof NodeProcess {
  return nodeProcess as typeof NodeProcess
}
