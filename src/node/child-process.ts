/**
 * @fileoverview Lazy-loader for `node:child_process`. See `node/fs.ts`
 * for the design rationale shared across all `node/*.ts` lazy-loaders.
 *
 * Filename uses `child-process` (kebab-case) to match the rest of
 * socket-lib's filename convention. The exported getter name is
 * `getNodeChildProcess` (camelCase, prefixed with `Node` to match
 * every other `node/*` lazy-loader).
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeChildProcess from 'node:child_process'

let _childProcess: typeof NodeChildProcess | undefined

/*@__NO_SIDE_EFFECTS__*/
export function getNodeChildProcess(): typeof NodeChildProcess {
  return (_childProcess ??=
    /*@__PURE__*/ require('node:child_process') as typeof NodeChildProcess)
}
