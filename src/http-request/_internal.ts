/**
 * @fileoverview Private lazy loaders for the Node.js modules used by
 * the `http-request/*` leaves. The `_` prefix keeps this module out of
 * the generated package.json `exports` map (the `dist/**\/_*` ignore
 * pattern in `scripts/fix/generate-package-exports.mts` filters it
 * out), so it is not part of the public surface — it exists only to
 * give `request.ts` and `download.ts` a common owner for the
 * `node:crypto`, `node:fs`, `node:http`, and `node:https` cached
 * imports.
 *
 * Each loader uses `require(...)` rather than a top-level `import` to
 * keep these built-ins out of bundler graphs (Webpack would otherwise
 * fail in browser builds because the package's `browser` field maps
 * the same module names to `false`).
 */

let _http: typeof import('node:http') | undefined
let _https: typeof import('node:https') | undefined

// Re-export canonical node:crypto / node:fs loaders under the
// http-request/ legacy names. New code should import
// getNodeCrypto / getNodeFs from '@socketsecurity/lib/node/{crypto,fs}'.
export { getNodeCrypto as getCrypto } from '../node/crypto'
export { getNodeFs as getFs } from '../node/fs'

/**
 * Lazily load http and https modules to avoid Webpack errors.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getHttp() {
  if (_http === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _http = /*@__PURE__*/ require('node:http')
  }
  return _http as typeof import('node:http')
}

/*@__NO_SIDE_EFFECTS__*/
export function getHttps() {
  if (_https === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _https = /*@__PURE__*/ require('node:https')
  }
  return _https as typeof import('node:https')
}
