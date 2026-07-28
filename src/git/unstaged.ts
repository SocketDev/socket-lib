/**
 * @file "Edited but not yet staged" helpers — `git diff` over the working tree
 *   only. Excludes index-staged changes and untracked paths; use `changed.ts`
 *   for the broader view or `staged.ts` for the index.
 */

import { normalizePath } from '../paths/normalize'
import { ArrayPrototypeIncludes } from '../primordials/array'
import { getGitDiffSpawnArgs, innerDiff, innerDiffSync } from './_internal'
import { getCachedRealpath, getCwd, getPath } from './repo'

import type { GitDiffOptions } from './types'

/**
 * Get unstaged modified files (changes not yet staged for commit).
 *
 * Uses `git diff --name-only` which returns only unstaged modifications to
 * tracked files. Does NOT include: - Untracked files (new files not added to
 * git) - Staged changes (files added with `git add`)
 *
 * This is a focused check for uncommitted changes to existing tracked files.
 * Useful for detecting work-in-progress modifications before staging.
 *
 * @example
 *   ;```typescript
 *   // Get unstaged files
 *   const files = await getUnstagedFiles()
 *   // => ['src/foo.ts', 'src/bar.ts']
 *
 *   // After staging some files
 *   await spawn('git', ['add', 'src/foo.ts'])
 *   const files = await getUnstagedFiles()
 *   // => ['src/bar.ts'] (foo.ts no longer included)
 *
 *   // Get absolute paths
 *   const files = await getUnstagedFiles({ absolute: true })
 *   // => ['/path/to/repo/src/bar.ts']
 *   ```
 *
 * @param options - Options controlling path format and filtering.
 *
 * @returns Promise resolving to array of unstaged file paths.
 */
export async function getUnstagedFiles(
  options?: GitDiffOptions | undefined,
): Promise<string[]> {
  options = { __proto__: null, ...options } as typeof options
  const args = getGitDiffSpawnArgs(options?.cwd).unstaged
  return await innerDiff(args, options)
}

/**
 * Get unstaged modified files (changes not yet staged for commit).
 *
 * Synchronous version of `getUnstagedFiles()`. Uses `git diff --name-only`
 * which returns only unstaged modifications to tracked files. Does NOT include:
 * - Untracked files (new files not added to git) - Staged changes (files added
 * with `git add`)
 *
 * This is a focused check for uncommitted changes to existing tracked files.
 * Useful for detecting work-in-progress modifications before staging.
 *
 * @example
 *   ;```typescript
 *   // Get unstaged files
 *   const files = getUnstagedFilesSync()
 *   // => ['src/foo.ts', 'src/bar.ts']
 *
 *   // After staging some files
 *   spawnSync('git', ['add', 'src/foo.ts'])
 *   const files = getUnstagedFilesSync()
 *   // => ['src/bar.ts'] (foo.ts no longer included)
 *
 *   // Get absolute paths
 *   const files = getUnstagedFilesSync({ absolute: true })
 *   // => ['/path/to/repo/src/bar.ts']
 *   ```
 *
 * @param options - Options controlling path format and filtering.
 *
 * @returns Array of unstaged file paths.
 */
export function getUnstagedFilesSync(
  options?: GitDiffOptions | undefined,
): string[] {
  options = { __proto__: null, ...options } as typeof options
  const args = getGitDiffSpawnArgs(options?.cwd).unstaged
  return innerDiffSync(args, options)
}

/**
 * Check if a file or directory has unstaged changes.
 *
 * Checks if the given pathname has modifications that are not yet staged for
 * commit (changes not added with `git add`). Does NOT include: - Staged changes
 * (already added with `git add`) - Untracked files (new files not in git)
 *
 * For directories, returns `true` if ANY file within the directory has unstaged
 * changes.
 *
 * Symlinks in the pathname and cwd are automatically resolved using
 * `fs.realpathSync()` before comparison.
 *
 * @example
 *   ;```typescript
 *   // Check if file has unstaged changes
 *   const unstaged = await isUnstaged('src/foo.ts')
 *   // => true
 *
 *   // After staging the file
 *   await spawn('git', ['add', 'src/foo.ts'])
 *   const unstaged = await isUnstaged('src/foo.ts')
 *   // => false
 *
 *   // Check directory
 *   const unstaged = await isUnstaged('src/')
 *   // => true (if any file in src/ has unstaged changes)
 *   ```
 *
 * @param pathname - File or directory path to check.
 * @param options - Options for the git diff check.
 *
 * @returns Promise resolving to `true` if path has unstaged changes, `false`
 *   otherwise.
 */
export async function isUnstaged(
  pathname: string,
  options?: GitDiffOptions | undefined,
): Promise<boolean> {
  const files = await getUnstagedFiles({
    __proto__: null,
    ...options,
    absolute: false,
  })
  const path = getPath()
  // Resolve pathname to handle symlinks before computing relative path (using cache).
  const resolvedPathname = getCachedRealpath(pathname)
  // options.cwd-passed arm exercised when caller specifies cwd; default getCwd().
  /* c8 ignore start */
  const baseCwd = options?.cwd ? getCachedRealpath(options['cwd']) : getCwd()
  /* c8 ignore stop */
  const relativePath = normalizePath(path.relative(baseCwd, resolvedPathname))
  return ArrayPrototypeIncludes(files, relativePath)
}

/**
 * Check if a file or directory has unstaged changes.
 *
 * Synchronous version of `isUnstaged()`. Checks if the given pathname has
 * modifications that are not yet staged for commit (changes not added with `git
 * add`). Does NOT include: - Staged changes (already added with `git add`) -
 * Untracked files (new files not in git)
 *
 * For directories, returns `true` if ANY file within the directory has unstaged
 * changes.
 *
 * Symlinks in the pathname and cwd are automatically resolved using
 * `fs.realpathSync()` before comparison.
 *
 * @example
 *   ;```typescript
 *   // Check if file has unstaged changes
 *   const unstaged = isUnstagedSync('src/foo.ts')
 *   // => true
 *
 *   // After staging the file
 *   spawnSync('git', ['add', 'src/foo.ts'])
 *   const unstaged = isUnstagedSync('src/foo.ts')
 *   // => false
 *
 *   // Check directory
 *   const unstaged = isUnstagedSync('src/')
 *   // => true (if any file in src/ has unstaged changes)
 *   ```
 *
 * @param pathname - File or directory path to check.
 * @param options - Options for the git diff check.
 *
 * @returns `true` if path has unstaged changes, `false` otherwise.
 */
export function isUnstagedSync(
  pathname: string,
  options?: GitDiffOptions | undefined,
): boolean {
  const files = getUnstagedFilesSync({
    __proto__: null,
    ...options,
    absolute: false,
  })
  const path = getPath()
  // Resolve pathname to handle symlinks before computing relative path (using cache).
  const resolvedPathname = getCachedRealpath(pathname)
  // options.cwd-passed arm exercised when caller specifies cwd; default getCwd().
  /* c8 ignore start */
  const baseCwd = options?.cwd ? getCachedRealpath(options['cwd']) : getCwd()
  /* c8 ignore stop */
  const relativePath = normalizePath(path.relative(baseCwd, resolvedPathname))
  return ArrayPrototypeIncludes(files, relativePath)
}
