/**
 * @file "Ready for the next commit" helpers — `git diff --cached` over only the
 *   index. Excludes unstaged tracked-file edits and untracked paths; use
 *   `changed.ts` if you need the broader view.
 */

import { normalizePath } from '../paths/normalize'
import { ArrayPrototypeIncludes } from '../primordials/array'
import { getGitDiffSpawnArgs, innerDiff, innerDiffSync } from './_internal'
import { getCachedRealpath, getCwd, getPath } from './repo'

import type { GitDiffOptions } from './types'

/**
 * Get staged files ready for commit (changes added with `git add`).
 *
 * Uses `git diff --cached --name-only` which returns only staged changes. Does
 * NOT include: - Unstaged modifications (changes not added with `git add`) -
 * Untracked files (new files not added to git)
 *
 * This is a focused check for what will be included in the next commit. Useful
 * for validating changes before committing or running pre-commit hooks.
 *
 * @example
 *   ;```typescript
 *   // Get currently staged files
 *   const files = await getStagedFiles()
 *   // => ['src/foo.ts']
 *
 *   // Stage more files
 *   await spawn('git', ['add', 'src/bar.ts'])
 *   const files = await getStagedFiles()
 *   // => ['src/foo.ts', 'src/bar.ts']
 *
 *   // Get absolute paths
 *   const files = await getStagedFiles({ absolute: true })
 *   // => ['/path/to/repo/src/foo.ts', ...]
 *   ```
 *
 * @param options - Options controlling path format and filtering.
 *
 * @returns Promise resolving to array of staged file paths.
 */
export async function getStagedFiles(
  options?: GitDiffOptions | undefined,
): Promise<string[]> {
  options = { __proto__: null, ...options } as typeof options
  const args = getGitDiffSpawnArgs(options?.cwd).staged
  return await innerDiff(args, options)
}

/**
 * Get staged files ready for commit (changes added with `git add`).
 *
 * Synchronous version of `getStagedFiles()`. Uses `git diff --cached
 * --name-only` which returns only staged changes. Does NOT include: - Unstaged
 * modifications (changes not added with `git add`) - Untracked files (new files
 * not added to git)
 *
 * This is a focused check for what will be included in the next commit. Useful
 * for validating changes before committing or running pre-commit hooks.
 *
 * @example
 *   ;```typescript
 *   // Get currently staged files
 *   const files = getStagedFilesSync()
 *   // => ['src/foo.ts']
 *
 *   // Stage more files
 *   spawnSync('git', ['add', 'src/bar.ts'])
 *   const files = getStagedFilesSync()
 *   // => ['src/foo.ts', 'src/bar.ts']
 *
 *   // Get absolute paths
 *   const files = getStagedFilesSync({ absolute: true })
 *   // => ['/path/to/repo/src/foo.ts', ...]
 *   ```
 *
 * @param options - Options controlling path format and filtering.
 *
 * @returns Array of staged file paths.
 */
export function getStagedFilesSync(
  options?: GitDiffOptions | undefined,
): string[] {
  options = { __proto__: null, ...options } as typeof options
  const args = getGitDiffSpawnArgs(options?.cwd).staged
  return innerDiffSync(args, options)
}

/**
 * Check if a file or directory is staged for commit.
 *
 * Checks if the given pathname has changes staged with `git add` that will be
 * included in the next commit. Does NOT include: - Unstaged modifications
 * (changes not added with `git add`) - Untracked files (new files not in git)
 *
 * For directories, returns `true` if ANY file within the directory is staged.
 *
 * Symlinks in the pathname and cwd are automatically resolved using
 * `fs.realpathSync()` before comparison.
 *
 * @example
 *   ;```typescript
 *   // Check if file is staged
 *   const staged = await isStaged('src/foo.ts')
 *   // => false
 *
 *   // Stage the file
 *   await spawn('git', ['add', 'src/foo.ts'])
 *   const staged = await isStaged('src/foo.ts')
 *   // => true
 *
 *   // Check directory
 *   const staged = await isStaged('src/')
 *   // => true (if any file in src/ is staged)
 *   ```
 *
 * @param pathname - File or directory path to check.
 * @param options - Options for the git diff check.
 *
 * @returns Promise resolving to `true` if path is staged, `false` otherwise.
 */
export async function isStaged(
  pathname: string,
  options?: GitDiffOptions | undefined,
): Promise<boolean> {
  const files = await getStagedFiles({
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
 * Check if a file or directory is staged for commit.
 *
 * Synchronous version of `isStaged()`. Checks if the given pathname has changes
 * staged with `git add` that will be included in the next commit. Does NOT
 * include: - Unstaged modifications (changes not added with `git add`) -
 * Untracked files (new files not in git)
 *
 * For directories, returns `true` if ANY file within the directory is staged.
 *
 * Symlinks in the pathname and cwd are automatically resolved using
 * `fs.realpathSync()` before comparison.
 *
 * @example
 *   ;```typescript
 *   // Check if file is staged
 *   const staged = isStagedSync('src/foo.ts')
 *   // => false
 *
 *   // Stage the file
 *   spawnSync('git', ['add', 'src/foo.ts'])
 *   const staged = isStagedSync('src/foo.ts')
 *   // => true
 *
 *   // Check directory
 *   const staged = isStagedSync('src/')
 *   // => true (if any file in src/ is staged)
 *   ```
 *
 * @param pathname - File or directory path to check.
 * @param options - Options for the git diff check.
 *
 * @returns `true` if path is staged, `false` otherwise.
 */
export function isStagedSync(
  pathname: string,
  options?: GitDiffOptions | undefined,
): boolean {
  const files = getStagedFilesSync({
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
