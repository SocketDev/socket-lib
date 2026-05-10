/**
 * @fileoverview "Anything different from HEAD" helpers — the broad-strokes
 * `git status --porcelain` view that lumps staged, unstaged, and untracked
 * paths together. Use these when you want a single answer to "did anything
 * change?"; reach for `staged.ts` / `unstaged.ts` when the distinction
 * matters.
 */

import { normalizePath } from '../paths/normalize'
import { ArrayPrototypeIncludes } from '../primordials/array'
import { getGitDiffSpawnArgs, innerDiff, innerDiffSync } from './_internal'
import { getCachedRealpath, getCwd, getPath } from './repo'

import type { GitDiffOptions } from './types'

/**
 * Get all changed files including staged, unstaged, and untracked files.
 *
 * Uses `git status --porcelain` which returns the full working tree status
 * with status codes:
 * - `M` - Modified
 * - `A` - Added
 * - `D` - Deleted
 * - `??` - Untracked
 * - `R` - Renamed
 * - `C` - Copied
 *
 * This is the most comprehensive check - captures everything that differs
 * from the last commit, including:
 * - Files modified and staged with `git add`
 * - Files modified but not staged
 * - New files not yet tracked by git
 *
 * Status codes are automatically stripped from the output.
 *
 * @param options - Options controlling path format and filtering.
 * @returns Promise resolving to array of changed file paths.
 *
 * @example
 * ```typescript
 * // Get all changed files as relative paths
 * const files = await getChangedFiles()
 * // => ['src/foo.ts', 'src/bar.ts', 'newfile.ts']
 *
 * // Get absolute paths
 * const files = await getChangedFiles({ absolute: true })
 * // => ['/path/to/repo/src/foo.ts', ...]
 *
 * // Get changed files in specific directory
 * const files = await getChangedFiles({ cwd: '/path/to/repo/src' })
 * // => ['foo.ts', 'bar.ts']
 * ```
 */
export async function getChangedFiles(
  options?: GitDiffOptions | undefined,
): Promise<string[]> {
  const args = getGitDiffSpawnArgs(options?.cwd).all
  return await innerDiff(args, {
    __proto__: null,
    ...options,
    porcelain: true,
  })
}

/**
 * Get all changed files including staged, unstaged, and untracked files.
 *
 * Synchronous version of `getChangedFiles()`. Uses `git status --porcelain`
 * which returns the full working tree status with status codes:
 * - `M` - Modified
 * - `A` - Added
 * - `D` - Deleted
 * - `??` - Untracked
 * - `R` - Renamed
 * - `C` - Copied
 *
 * This is the most comprehensive check - captures everything that differs
 * from the last commit, including:
 * - Files modified and staged with `git add`
 * - Files modified but not staged
 * - New files not yet tracked by git
 *
 * Status codes are automatically stripped from the output.
 *
 * @param options - Options controlling path format and filtering.
 * @returns Array of changed file paths.
 *
 * @example
 * ```typescript
 * // Get all changed files as relative paths
 * const files = getChangedFilesSync()
 * // => ['src/foo.ts', 'src/bar.ts', 'newfile.ts']
 *
 * // Get absolute paths
 * const files = getChangedFilesSync({ absolute: true })
 * // => ['/path/to/repo/src/foo.ts', ...]
 *
 * // Get changed files in specific directory
 * const files = getChangedFilesSync({ cwd: '/path/to/repo/src' })
 * // => ['foo.ts', 'bar.ts']
 * ```
 */
export function getChangedFilesSync(
  options?: GitDiffOptions | undefined,
): string[] {
  const args = getGitDiffSpawnArgs(options?.cwd).all
  return innerDiffSync(args, {
    __proto__: null,
    ...options,
    porcelain: true,
  })
}

/**
 * Check if a file or directory has any git changes.
 *
 * Checks if the given pathname has any changes including:
 * - Staged modifications (added with `git add`)
 * - Unstaged modifications (not yet staged)
 * - Untracked status (new file/directory not in git)
 *
 * For directories, returns `true` if ANY file within the directory has changes.
 *
 * Symlinks in the pathname and cwd are automatically resolved using
 * `fs.realpathSync()` before comparison.
 *
 * @param pathname - File or directory path to check.
 * @param options - Options for the git status check.
 * @returns Promise resolving to `true` if path has any changes, `false` otherwise.
 *
 * @example
 * ```typescript
 * // Check if file is changed
 * const changed = await isChanged('src/foo.ts')
 * // => true
 *
 * // Check if directory has any changes
 * const changed = await isChanged('src/')
 * // => true (if any file in src/ is changed)
 *
 * // Check from different cwd
 * const changed = await isChanged(
 *   '/path/to/repo/src/foo.ts',
 *   { cwd: '/path/to/repo' }
 * )
 * ```
 */
export async function isChanged(
  pathname: string,
  options?: GitDiffOptions | undefined,
): Promise<boolean> {
  const files = await getChangedFiles({
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
 * Check if a file or directory has any git changes.
 *
 * Synchronous version of `isChanged()`. Checks if the given pathname has
 * any changes including:
 * - Staged modifications (added with `git add`)
 * - Unstaged modifications (not yet staged)
 * - Untracked status (new file/directory not in git)
 *
 * For directories, returns `true` if ANY file within the directory has changes.
 *
 * Symlinks in the pathname and cwd are automatically resolved using
 * `fs.realpathSync()` before comparison.
 *
 * @param pathname - File or directory path to check.
 * @param options - Options for the git status check.
 * @returns `true` if path has any changes, `false` otherwise.
 *
 * @example
 * ```typescript
 * // Check if file is changed
 * const changed = isChangedSync('src/foo.ts')
 * // => true
 *
 * // Check if directory has any changes
 * const changed = isChangedSync('src/')
 * // => true (if any file in src/ is changed)
 *
 * // Check from different cwd
 * const changed = isChangedSync(
 *   '/path/to/repo/src/foo.ts',
 *   { cwd: '/path/to/repo' }
 * )
 * ```
 */
export function isChangedSync(
  pathname: string,
  options?: GitDiffOptions | undefined,
): boolean {
  const files = getChangedFilesSync({
    __proto__: null,
    ...options,
    absolute: false,
  })
  const path = getPath()
  // Resolve pathname to handle symlinks before computing relative path (using cache).
  try {
    const resolvedPathname = getCachedRealpath(pathname)
    // options.cwd-passed arm exercised when caller specifies cwd; default getCwd().
    /* c8 ignore start */
    const baseCwd = options?.cwd ? getCachedRealpath(options['cwd']) : getCwd()
    /* c8 ignore stop */
    const relativePath = normalizePath(path.relative(baseCwd, resolvedPathname))
    return ArrayPrototypeIncludes(files, relativePath)
  } catch {
    // Path doesn't exist or can't be resolved - it can't be changed
    return false
  }
}
