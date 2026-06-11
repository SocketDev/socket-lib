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

// `getNodePath()` returns the module object with LATE method lookup (spy-able).
// For a hot path wanting tamper-proof methods, use the frozen `path<Method>`
// snapshots below — see node/fs.ts for the full two-surface rationale.
export function getNodePath(): typeof NodePath {
  return nodePath as typeof NodePath
}

// ── Frozen hot-method snapshots ──────────────────────────────────────
// The fleet's hottest path methods, captured by reference at load off the
// IS_NODE-gated module (undefined in a browser). path methods are standalone
// (no `this`), so a member read freezes the reference; a later
// `nodePath.join = evil` can't redirect these. Frozen refs aren't spy-able —
// use `getNodePath()` for the test-seam path. Direct-const exports (the
// primordials/intl shape) keep it sort-clean + tree-shakable.
export const pathBasename = nodePath?.basename
export const pathDirname = nodePath?.dirname
export const pathExtname = nodePath?.extname
export const pathIsAbsolute = nodePath?.isAbsolute
export const pathJoin = nodePath?.join
export const pathRelative = nodePath?.relative
export const pathResolve = nodePath?.resolve
