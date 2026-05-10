/**
 * @fileoverview Private state shared between `fs/safe` and
 * `fs/path-cache`. The `_` prefix keeps this module out of the
 * generated package.json `exports` map (the
 * `dist/**\/_*` ignore pattern in
 * `scripts/fix/generate-package-exports.mts` filters it out), so it is
 * not part of the public surface — it exists only to give the two
 * leaves above a common owner for the allowed-directory cache.
 *
 * The cache is invalidated by `invalidatePathCache()` in
 * `fs/path-cache.ts` whenever paths are rewired in tests
 * (`paths/rewire.ts` registers `invalidatePathCache` as one of its
 * cache callbacks); `getAllowedDirectories()` rehydrates on next call.
 */

import { getNodePath } from '../node/path'
import {
  getOsTmpDir,
  getSocketCacacheDir,
  getSocketUserDir,
} from '../paths/socket'

let _cachedAllowedDirs: string[] | undefined

/**
 * Clear the cached allowed-directories list. Used by
 * `invalidatePathCache()` when test path rewiring changes any of the
 * underlying paths so the next read picks up the new resolved values.
 */
export function clearAllowedDirectories(): void {
  _cachedAllowedDirs = undefined
}

/**
 * Get resolved allowed directories for safe deletion with lazy caching.
 * These directories are resolved once and cached for the process lifetime.
 */
export function getAllowedDirectories(): string[] {
  if (_cachedAllowedDirs === undefined) {
    const path = getNodePath()

    _cachedAllowedDirs = [
      path.resolve(getOsTmpDir()),
      path.resolve(getSocketCacacheDir()),
      path.resolve(getSocketUserDir()),
    ]
  }
  return _cachedAllowedDirs
}
