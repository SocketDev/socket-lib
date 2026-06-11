/**
 * @file Early-snapshot accessor for `node:fs`. The `require('fs')` runs at
 *   module load, but ONLY inside the `IS_NODE` runtime guard — in a browser
 *   `IS_NODE` is `false`, so the require branch never executes (bundlers mark
 *   `node:` builtins external, so the call survives in the output but is
 *   unreachable at runtime). In Node the module is captured at load: a
 *   primordial-style snapshot, so a later tamper of the `node:fs` cache entry
 *   can't redirect what we already hold. `getNodeFs()` returns the captured
 *   reference; the `/*@__PURE__*\/` lets a Node-targeted minifier strip the
 *   capture when `getNodeFs` is unused. Was a lazy first-call loader; the
 *   eager-but-guarded form keeps the browser-safe behavior while gaining the
 *   load-time snapshot. Two surfaces: `getNodeFs()` returns the module object
 *   with LATE method lookup (spy-able — the test seam); the `fs<Method>` consts
 *   (`fsExistsSync`, `fsReadFileSync`, …) are method references FROZEN at load
 *   (tamper-proof against a method swap, not spy-able), for the fleet's hot fs
 *   calls. Both stay browser-safe behind IS_NODE + `/*@__PURE__*\/`.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeFs from 'node:fs'

import { IS_NODE } from '../constants/runtime'

// Captured at module load behind the runtime IS_NODE guard (false in browsers,
// so the require never runs there). The `/*@__PURE__*/` must sit directly on
// the call (a wrapping cast would detach it), so cast on use, not inline.
// oxlint-disable-next-line unicorn/prefer-node-protocol -- bare specifier (not node:) so webpack resolve.fallback / browser-field can stub this builtin for browser bundles; node: prefix throws UnhandledSchemeError there
const nodeFs = IS_NODE ? /*@__PURE__*/ require('fs') : undefined

// `getNodeFs()` returns the captured MODULE object; methods are looked up LATE
// off it (`getNodeFs().existsSync(...)`). That is deliberate: the object
// snapshot defends against `require.cache['fs']` redirection, while late method
// lookup keeps the test seam intact — a `vi.spyOn(getNodeFs(), 'existsSync')`
// (or a direct property swap, as binary-cache.test does) is still observed.
// For a HOT path that wants tamper-proof methods too (a method swap on the
// captured object can't redirect a frozen ref), use the `fs<Method>` consts
// below instead.
export function getNodeFs(): typeof NodeFs {
  return nodeFs as typeof NodeFs
}

// ── Frozen hot-method snapshots ──────────────────────────────────────
// The fleet's hottest fs methods, captured by reference at load off the
// IS_NODE-gated module (undefined in a browser, where the browser field stubs
// `fs` to false). Node's fs sync methods are standalone functions (no `this`
// binding needed — verified), so a plain member read freezes the reference:
// unlike `getNodeFs().existsSync`, a later `nodeFs.existsSync = evil` cannot
// redirect these (the method-level twin of the object snapshot). Frozen refs
// are NOT spy-able — use `getNodeFs()` for the test-seam path; reach for these
// only on a hot path that wants tamper-resistance. Exported as direct consts
// (the `primordials/intl` shape) so there's no helper/getter to sort and no
// `/*@__PURE__*/`-on-a-call concern; an unused const tree-shakes on its own.
export const fsAccessSync = nodeFs?.accessSync
export const fsExistsSync = nodeFs?.existsSync
export const fsMkdirSync = nodeFs?.mkdirSync
export const fsReadFileSync = nodeFs?.readFileSync
export const fsRealpathSync = nodeFs?.realpathSync
export const fsStatSync = nodeFs?.statSync
export const fsWriteFileSync = nodeFs?.writeFileSync
