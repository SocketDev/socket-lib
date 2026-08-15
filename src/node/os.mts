/**
 * @file Early-snapshot accessor for `node:os`. See `node/fs.ts` for the shared
 *   rationale: the `require` runs at module load behind the runtime `IS_NODE`
 *   guard (false in browsers → never executes there), giving a load-time
 *   snapshot in Node while staying browser-safe. `getNodeOs()` returns the
 *   module object for a late, spy-able method lookup; the frozen `os<Method>`
 *   snapshots below are the tamper-proof hot-path twin.
 */

import type * as NodeOs from 'node:os'

import { IS_NODE } from '../constants/runtime.mjs'

// Bare specifier, not node:, so webpack resolve.fallback / the browser field
// can stub this builtin in browser bundles; a node: prefix throws
// UnhandledSchemeError there.
// oxlint-disable-next-line unicorn/prefer-node-protocol -- browser stub
const nodeOs = IS_NODE ? /*@__PURE__*/ require('os') : undefined

export function getNodeOs(): typeof NodeOs {
  return nodeOs as typeof NodeOs
}

// ── Frozen hot-method snapshots ──────────────────────────────────────
// Socket's hottest os methods, captured by reference at load off the
// IS_NODE-gated module, which is undefined in a browser. Frozen refs aren't
// spy-able — use `getNodeOs()` for the test-seam path. See node/fs.ts for the
// full two-surface rationale.
export const osArch = nodeOs?.arch
export const osHomedir = nodeOs?.homedir
export const osPlatform = nodeOs?.platform
export const osTmpdir = nodeOs?.tmpdir
