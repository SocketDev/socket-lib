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

let _crypto: typeof import('node:crypto') | undefined
let _fs: typeof import('node:fs') | undefined
let _http: typeof import('node:http') | undefined
let _https: typeof import('node:https') | undefined

/**
 * Lazily load the crypto module to avoid Webpack errors.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getCrypto() {
  if (_crypto === undefined) {
    _crypto = /*@__PURE__*/ require('node:crypto')
  }
  return _crypto as typeof import('node:crypto')
}

/**
 * Lazily load the fs module to avoid Webpack errors.
 */
/*@__NO_SIDE_EFFECTS__*/
export function getFs() {
  if (_fs === undefined) {
    _fs = /*@__PURE__*/ require('node:fs')
  }
  return _fs as typeof import('node:fs')
}

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
