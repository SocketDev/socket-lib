/**
 * @fileoverview Shared internals for the `dlx/package` split — lazy
 * `node:fs` / `node:path` loaders + the bounded LRU cache used by
 * `resolveBinaryPath` on Windows. Kept as a leaf so every other dlx
 * file in the split (`spec`, `firewall`, `binary-resolution`,
 * `package` itself) can layer above it without cycles.
 *
 * `binary.ts` ships its own duplicate `getFs` / `getPath` for now —
 * collapsing them into this single source of truth is a follow-up.
 */

import { MapCtor } from '../primordials/map-set'

let _crypto: typeof import('node:crypto') | undefined
let _fs: typeof import('node:fs') | undefined
let _path: typeof import('node:path') | undefined

/**
 * Lazily load the crypto module to avoid Webpack errors.
 * Uses non-'node:' prefixed require to prevent Webpack bundling issues.
 *
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
export function getCrypto() {
  if (_crypto === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _crypto = /*@__PURE__*/ require('node:crypto')
  }
  return _crypto as typeof import('node:crypto')
}

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

// Cache for binary path resolution to avoid repeated extension checks
// on Windows. Bounded LRU: a long-running process that resolves many
// distinct binary paths used to accumulate entries forever, and entries
// for paths that have since been garbage-collected by `cleanDlxCache`
// were never reclaimed. Map iteration order = insertion order; accessing
// an entry re-inserts it to bump recency.
export const BINARY_PATH_CACHE_MAX_SIZE = 200
export const binaryPathCache = new MapCtor<string, string>()

export function binaryPathCacheSet(key: string, value: string): void {
  if (binaryPathCache.has(key)) {
    binaryPathCache.delete(key)
  } else if (binaryPathCache.size >= BINARY_PATH_CACHE_MAX_SIZE) {
    const oldest = binaryPathCache.keys().next().value
    if (oldest !== undefined) {
      binaryPathCache.delete(oldest)
    }
  }
  binaryPathCache.set(key, value)
}
