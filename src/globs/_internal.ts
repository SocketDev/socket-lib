/**
 * @file Private internals for `globs/*` modules — lazy module accessors,
 *   normalization helpers, and the matcher LRU cache. The `defaultIgnore` list
 *   lives in the public `defaults.ts` file; this file re-exports it so
 *   co-located helpers can import everything through one path.
 */

import { ArrayCtor, ArrayIsArray } from '../primordials/array'
import { MapCtor } from '../primordials/map-set'
import { StringPrototypeCharCodeAt } from '../primordials/string'
import { normalizePath } from '../paths/normalize'

import { defaultIgnore } from './defaults'

import type * as fastGlobType from '../external/fast-glob'
import type picomatchType from '../external/picomatch'

export { defaultIgnore }

export const MATCHER_CACHE_MAX_SIZE = 100
// LRU cache. We exploit Map's insertion-order iteration so eviction is O(1):
// delete the first key. On read, delete + set moves the entry to the back,
// keeping the cache in recency order.
export const matcherCache = new MapCtor<string, (path: string) => boolean>()

let _fastGlob: typeof fastGlobType | undefined
let _picomatch: typeof picomatchType | undefined

// Re-export canonical node:fs / node:fs/promises loaders under the
// globs/ legacy names. New code should import getNodeFs /
// getNodeFsPromises from '@socketsecurity/lib/node/{fs,fs-promises}'.
export { getNodeFs as getFs } from '../node/fs'
export { getNodeFsPromises as getFsPromises } from '../node/fs-promises'

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
 * Glob results are normalized to forward slashes regardless of the backend
 * (node:fs.glob returns native-OS separators on Windows; fast-glob already
 * returns forward slashes). Single contract: callers don't have to think about
 * separators per platform. Routes through `paths/normalize.normalizePath` so
 * this stays consistent with every other path-shaped string in the lib.
 */
export function normalizeGlobResults(out: string[]): string[] {
  for (let i = 0; i < out.length; i += 1) {
    out[i] = normalizePath(out[i]!)
  }
  return out
}

/**
 * Normalize a user-provided ignore array by running every entry through
 * stripTrailingSlash. Returns undefined when `ignore` is not an array so
 * callers can skip merging the option entirely.
 *
 * Uses a pre-sized for-loop instead of `.map`: socket-lib uses primordials (the
 * prototype `Array.prototype.map` can be intercepted or replaced by user code
 * at module load), and a hand-rolled loop is also marginally faster — no
 * callback indirection, no growth of the result array.
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

/**
 * Strip a trailing `/` from a glob pattern so fast-glob's deep filter matches
 * it. See header comment in `glob.ts` for the full rationale — shortest
 * summary: a `dist/` ignore pattern lets fast-glob walk the whole subtree
 * before filtering, while `dist` (no slash) skips the walk entirely.
 *
 * CharCode 47 is `/`. Reading it that way avoids a per-call string allocation
 * for the literal — primordials-friendly, no behavior change vs.
 * `pattern.endsWith('/')`.
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
