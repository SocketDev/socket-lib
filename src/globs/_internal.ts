/**
 * @fileoverview Private internals for `globs/*` modules — lazy module
 * accessors, default ignore list, normalization helpers, and the
 * matcher LRU cache. Underscore prefix excludes from public exports.
 */

import { objectFreeze as ObjectFreeze } from '../objects/mutate'
import { normalizePath } from '../paths/normalize'
import { ArrayCtor, ArrayIsArray } from '../primordials/array'
import { MapCtor } from '../primordials/map-set'
import { StringPrototypeCharCodeAt } from '../primordials/string'

import type * as fastGlobType from '../external/fast-glob'
import type picomatchType from '../external/picomatch'

export const MATCHER_CACHE_MAX_SIZE = 100
// LRU cache. We exploit Map's insertion-order iteration so eviction is O(1):
// delete the first key. On read, delete + set moves the entry to the back,
// keeping the cache in recency order.
export const matcherCache = new MapCtor<string, (path: string) => boolean>()

export const defaultIgnore = ObjectFreeze([
  // https://docs.npmjs.com/cli/v10/configuring-npm/package-json#files
  '**/.git',
  '**/.npmrc',
  '**/node_modules',
  // https://github.com/npm/npm-packlist/blob/v10.0.0/lib/index.js#L15-L38
  '**/.DS_Store',
  '**/.gitignore',
  '**/.hg',
  '**/.lock-wscript',
  '**/.npmignore',
  '**/.svn',
  '**/.wafpickle-*',
  '**/.*.swp',
  '**/._*/**',
  '**/archived-packages/**',
  '**/build/config.gypi',
  '**/CVS',
  '**/npm-debug.log',
  '**/*.orig',
  // Inline generic socket-registry .gitignore entries.
  '**/.env',
  '**/.eslintcache',
  '**/.nvm',
  '**/.tap',
  '**/.vscode',
  '**/*.tsbuildinfo',
  '**/Thumbs.db',
  // Inline additional ignores.
  '**/bower_components',
])

let _fastGlob: typeof fastGlobType | undefined
let _fs: typeof import('node:fs') | undefined
let _fsPromises: typeof import('node:fs/promises') | undefined
let _picomatch: typeof picomatchType | undefined

/**
 * Lazily load the fs module to avoid Webpack errors.
 *
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
export function getFs() {
  if (_fs === undefined) {
    _fs = /*@__PURE__*/ require('node:fs')
  }
  return _fs as typeof import('node:fs')
}

/**
 * Lazily load the fs/promises module to avoid Webpack errors.
 *
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
export function getFsPromises() {
  if (_fsPromises === undefined) {
    _fsPromises = /*@__PURE__*/ require('node:fs/promises')
  }
  return _fsPromises as typeof import('node:fs/promises')
}

/*@__NO_SIDE_EFFECTS__*/
export function getFastGlob() {
  if (_fastGlob === undefined) {
    _fastGlob = /*@__PURE__*/ require('../external/fast-glob.js')
  }
  return _fastGlob!
}

/*@__NO_SIDE_EFFECTS__*/
export function getPicomatch() {
  if (_picomatch === undefined) {
    _picomatch = /*@__PURE__*/ require('../external/picomatch.js')
  }
  return _picomatch!
}

/**
 * Strip a trailing `/` from a glob pattern so fast-glob's deep filter
 * matches it. See header comment in `glob.ts` for the full rationale —
 * shortest summary: a `dist/` ignore pattern lets fast-glob walk the
 * whole subtree before filtering, while `dist` (no slash) skips the
 * walk entirely.
 *
 * charCode 47 is `/`. Reading it that way avoids a per-call string
 * allocation for the literal — primordials-friendly, no behavior
 * change vs. `pattern.endsWith('/')`.
 */
export function stripTrailingSlash(pattern: string): string {
  if (
    pattern.length > 1 &&
    StringPrototypeCharCodeAt(pattern, pattern.length - 1) === 47 /*'/'*/
  ) {
    return pattern.slice(0, -1)
  }
  return pattern
}

/**
 * Glob results are normalized to forward slashes regardless of the
 * backend (node:fs.glob returns native-OS separators on Windows;
 * fast-glob already returns forward slashes). Single contract:
 * callers don't have to think about separators per platform. Routes
 * through `paths/normalize.normalizePath` so this stays consistent
 * with every other path-shaped string in the lib.
 */
export function normalizeGlobResults(out: string[]): string[] {
  for (let i = 0; i < out.length; i += 1) {
    out[i] = normalizePath(out[i]!)
  }
  return out
}

/**
 * Normalize a user-provided ignore array by running every entry
 * through stripTrailingSlash. Returns undefined when `ignore` is not
 * an array so callers can skip merging the option entirely.
 *
 * Uses a pre-sized for-loop instead of `.map`: socket-lib uses
 * primordials (the prototype `Array.prototype.map` can be intercepted
 * or replaced by user code at module load), and a hand-rolled loop is
 * also marginally faster — no callback indirection, no growth of the
 * result array.
 */
export function normalizeIgnorePatterns(ignore: unknown): string[] | undefined {
  if (!ArrayIsArray(ignore)) {
    return undefined
  }
  const source = ignore as string[]
  const { length } = source
  const normalized = new ArrayCtor(length) as string[]
  for (let i = 0; i < length; i++) {
    normalized[i] = stripTrailingSlash(source[i]!)
  }
  return normalized
}

// Re-export defaultIgnore for public consumption (some consumers use
// it as a starting point for their own ignore arrays).
export { defaultIgnore as defaultIgnoreList }
