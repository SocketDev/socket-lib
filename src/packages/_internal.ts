/**
 * @fileoverview Shared internals for the `packages/` module — lazy
 * `node:fs` / `node:path` / `node:util` loaders. Kept as a single
 * file so callers in this module can pull them without cycles.
 */

let _fs: typeof import('node:fs') | undefined
let _path: typeof import('node:path') | undefined
let _util: typeof import('node:util') | undefined

/**
 * Lazily load the fs module to avoid Webpack errors.
 * Uses non-'node:' prefixed require to prevent Webpack bundling issues.
 *
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
export function getFs() {
  if (_fs === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _fs = /*@__PURE__*/ require('node:fs')
  }
  return _fs as typeof import('node:fs')
}

/**
 * Lazily load the path module to avoid Webpack errors.
 *
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
export function getPath() {
  if (_path === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _path = /*@__PURE__*/ require('node:path')
  }
  return _path as typeof import('node:path')
}

/**
 * Lazily load the util module to avoid Webpack errors.
 *
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
export function getUtil() {
  if (_util === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _util = /*@__PURE__*/ require('node:util')
  }
  return _util as typeof import('node:util')
}
