/**
 * @file Private state shared between `fs/safe` and `fs/path-cache`. The
 *   `shared.ts` filename keeps this module out of the generated package.json
 *   `exports` map (the `dist/**\/shared.*` ignore pattern in
 *   `scripts/repo/package-exports.config.mts` filters it out), so it is not
 *   part of the public surface — it exists only to give the two leaves above a
 *   common owner for the allowed-directory cache. The cache is invalidated by
 *   `invalidatePathCache()` in `fs/path-cache.ts` whenever paths are rewired in
 *   tests (`paths/rewire.ts` registers `invalidatePathCache` as one of its
 *   cache callbacks); `getAllowedDirectories()` rehydrates on next call.
 */

import { getNodeFs } from '../node/fs.mjs'
import { getNodePath } from '../node/path.mjs'
import {
  getOsTmpDir,
  getSocketCacacheDir,
  getSocketUserDir,
} from '../paths/socket.mjs'

let cachedAllowedDirs: string[] | undefined

/**
 * Clear the cached allowed-directories list. Used by `invalidatePathCache()`
 * when test path rewiring changes any of the underlying paths so the next read
 * picks up the new resolved values.
 */
export function clearAllowedDirectories(): void {
  cachedAllowedDirs = undefined
}

/**
 * Get resolved allowed directories for safe deletion with lazy caching. These
 * directories are resolved once and cached for the process lifetime.
 *
 * BOTH the resolved and the real path of each directory are listed, because
 * they differ whenever a component is a symlink and a caller may hold either
 * form. macOS is the case that matters: `os.tmpdir()` reports
 * `/var/folders/…`, its real path is `/private/var/folders/…`, and `/var` is a
 * symlink to `/private/var`. A caller that ran the path through
 * `fs.realpathSync` — which anything walking or globbing the temp tree does —
 * arrives with the `/private` form. Listing only the resolved form made that
 * caller look like it was deleting outside every allowed tree, so a scratch
 * cleanup inside the temp dir was refused.
 */
export function getAllowedDirectories(): string[] {
  if (cachedAllowedDirs === undefined) {
    const fs = getNodeFs()
    const path = getNodePath()
    const dirs = new Set<string>()

    for (const dir of [
      getOsTmpDir(),
      getSocketCacacheDir(),
      getSocketUserDir(),
    ]) {
      const resolved = path.resolve(dir)
      dirs.add(resolved)
      try {
        dirs.add(fs.realpathSync(resolved))
      } catch {
        // The directory need not exist yet — the cacache and Socket user dirs
        // are created lazily. The resolved form above still guards it.
      }
    }

    cachedAllowedDirs = [...dirs]
  }
  return cachedAllowedDirs
}
