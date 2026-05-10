/**
 * @fileoverview Private internals for `bin/*` modules — lazy `fs` /
 * `path` accessors and the binary-resolution caches. Underscore prefix
 * keeps this file out of the public exports map (see the
 * `dist/<dir>/_<file>` ignore in scripts/fix/generate-package-exports.mts).
 *
 * Two caches:
 *
 *   1. `binPathCache` — maps a binary name to its first resolved path.
 *      Validated with `existsSync` before reuse so a stale cache doesn't
 *      survive a tool reinstall mid-session.
 *
 *   2. `binPathAllCache` — same shape but stores all-match arrays for
 *      callers that pass `{ all: true }`. Separate cache because the
 *      two return shapes can't be reconciled without losing type info.
 *
 *   3. `voltaBinCache` — maps a `${voltaPath}:${basename}` composite key
 *      to the resolved Volta-managed binary path. Volta resolves npm /
 *      pnpm / yarn through a layered tools/image directory and the
 *      lookup is expensive enough that caching is worth the memory.
 */

import { MapCtor } from '../primordials'

export const binPathCache = new MapCtor<string, string>()

export const binPathAllCache = new MapCtor<string, string[]>()

export const voltaBinCache = new MapCtor<string, string>()

let _fs: typeof import('node:fs') | undefined

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

let _path: typeof import('node:path') | undefined

/**
 * Lazily load the path module to avoid Webpack errors.
 * Uses non-'node:' prefixed require to prevent Webpack bundling issues.
 *
 * @returns The Node.js path module
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
