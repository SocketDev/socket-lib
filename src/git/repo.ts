/**
 * @file Git repository discovery + foundational lazy fs/path/cwd helpers shared
 *   across `git/*` leaves. Owns `findGitRoot`, the realpath cache, the cwd
 *   resolver, and the lazy `node:fs` / `node:path` loaders — pulling these
 *   together keeps the dependency direction one-way: `_internal.ts` and the
 *   public-surface leaves all import from here.
 */

import { MapCtor } from '../primordials/map-set'
import { processCwd } from '../primordials/process'

import { getNodeFs } from '../node/fs'
import { getNodePath } from '../node/path'

// Cache for realpathSync results to avoid repeated filesystem calls.
// Validated with existsSync() which is cheaper than realpathSync().
export const realpathCache = new MapCtor<string, string>()

// Cache for git root lookups to avoid repeated directory traversal.
export const gitRootCache = new MapCtor<string, string>()

/**
 * Find git repository root by walking up from the given directory.
 *
 * Searches for a `.git` directory or file by traversing parent directories
 * upward until found or filesystem root is reached. Returns the original path
 * if no git repository is found.
 *
 * This function is exported primarily for testing purposes.
 *
 * @example
 *   ;```typescript
 *   const root = findGitRoot('/path/to/repo/src/subdir')
 *   // => '/path/to/repo'
 *
 *   const notFound = findGitRoot('/not/a/repo')
 *   // => '/not/a/repo'
 *   ```
 *
 * @param startPath - Directory path to start searching from.
 *
 * @returns Git repository root path, or `startPath` if not found.
 */
export function findGitRoot(startPath: string): string {
  const fs = getNodeFs()
  const path = getNodePath()

  // Check cache first - git roots don't change during process lifetime.
  // Cache hit fires on second call for same startPath; first-call
  // misses. Stale-cache eviction fires only if .git is removed.
  /* c8 ignore start */
  const cached = gitRootCache.get(startPath)
  if (cached) {
    if (fs.existsSync(path.join(cached, '.git'))) {
      return cached
    }
    gitRootCache.delete(startPath)
  }
  /* c8 ignore stop */

  let currentPath = startPath
  // Walk up the directory tree looking for .git
  while (true) {
    try {
      const gitPath = path.join(currentPath, '.git')
      if (fs.existsSync(gitPath)) {
        // Cache the result.
        gitRootCache.set(startPath, currentPath)
        return currentPath
      }
    } catch {
      // Ignore errors and continue walking up
    }
    const parentPath = path.dirname(currentPath)
    // Stop if we've reached the root or can't go up anymore
    if (parentPath === currentPath) {
      // Return original path if no .git found
      return startPath
    }
    currentPath = parentPath
  }
}

/**
 * Get the real path with caching to avoid repeated filesystem calls. Validates
 * cache with existsSync() which is cheaper than realpathSync().
 *
 * ENOENT/ENOTDIR are re-thrown because the caller explicitly passed a path they
 * expect to exist — swallowing these would turn "file not found" into a silent
 * no-op. Other errors (EACCES, EPERM, EIO) fall back to the input path since
 * they can happen on container/overlay filesystems where the path exists but
 * realpath resolution is restricted.
 */
export function getCachedRealpath(pathname: string): string {
  const fs = getNodeFs()
  const cached = realpathCache.get(pathname)
  // Cache hit fires on second call for the same pathname; first-call
  // misses. Stale-cache eviction fires if cwd symlink target is
  // removed mid-session.
  /* c8 ignore start */
  if (cached) {
    if (fs.existsSync(cached)) {
      return cached
    }
    realpathCache.delete(pathname)
  }
  /* c8 ignore stop */
  let resolved: string
  try {
    resolved = fs.realpathSync(pathname)
    /* c8 ignore start - realpathSync rarely throws for cwd; the
       non-ENOENT/ENOTDIR fallback is a defensive guard for EACCES /
       restricted-realpath setups. */
  } catch (e) {
    const code = (e as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') {
      throw e
    }
    resolved = pathname
  }
  /* c8 ignore stop */
  realpathCache.set(pathname, resolved)
  return resolved
}

/**
 * Get the current working directory for git operations.
 *
 * Returns the real path to handle symlinks correctly. This is important because
 * symlinked directories like `/tmp -> /private/tmp` can cause path mismatches
 * when comparing git output.
 *
 * @example
 *   ;```typescript
 *   const cwd = getCwd()
 *   // In /tmp (symlink to /private/tmp):
 *   // => '/private/tmp'
 *   ```
 *
 * @returns The resolved real path of `process.cwd()`.
 */
export function getCwd(): string {
  return getCachedRealpath(processCwd())
}

// Re-export canonical node lazy loaders under the `git/repo` legacy
// names so existing siblings keep working. New code should import
// `getNodeFs` / `getNodePath` from `@socketsecurity/lib/node/{fs,path}`
// directly.
export { getNodeFs as getFs } from '../node/fs'
export { getNodePath as getPath } from '../node/path'
