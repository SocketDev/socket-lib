/**
 * @file Early-snapshot accessor for `node:os`. See `node/fs.ts` for the shared
 *   rationale: the `require` runs at module load behind the runtime `IS_NODE`
 *   guard (false in browsers → never executes there), giving a load-time
 *   snapshot in Node while staying browser-safe. `getNodeOs()` returns the
 *   module object for a late, spy-able method lookup; the frozen `Os<Method>`
 *   snapshots below are the tamper-proof hot-path twin. They carry the
 *   capitalized primordial spelling because that is what they are: a frozen
 *   reference to a built-in method, same contract as `StringPrototypeCharAt`.
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
// spy-able — use `getNodeOs()` for the test injection path. See node/fs.ts for the
// full two-surface rationale.
export const OsArch = nodeOs?.arch
export const OsHomedir = nodeOs?.homedir
export const OsPlatform = nodeOs?.platform
export const OsTmpdir = nodeOs?.tmpdir
