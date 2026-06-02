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
  // Non-Node path returns undefined cast so bundlers still see no
  // static `require` and tree-shake the module; Node callers (the
  // entire `src/` tree) always traverse the `IS_NODE` branch and
  // get the real module — so the type narrowing is sound in practice.
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeChildProcess
  }
  return (childProcess ??=
    /*@__PURE__*/ require('node:child_process') as typeof NodeChildProcess)
}
