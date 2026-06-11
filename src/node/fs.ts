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
 *   load-time snapshot.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeFs from 'node:fs'

import { IS_NODE } from '../constants/runtime'

// Captured at module load behind the runtime IS_NODE guard (false in browsers,
// so the require never runs there). The `/*@__PURE__*/` must sit directly on
// the call (a wrapping cast would detach it), so cast on use, not inline.
// oxlint-disable-next-line unicorn/prefer-node-protocol -- bare specifier (not node:) so webpack resolve.fallback / browser-field can stub this builtin for browser bundles; node: prefix throws UnhandledSchemeError there
const nodeFs = IS_NODE ? /*@__PURE__*/ require('fs') : undefined

export function getNodeFs(): typeof NodeFs {
  return nodeFs as typeof NodeFs
}
