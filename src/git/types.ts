/**
 * @fileoverview Public type surface for `git/*` modules — interfaces only.
 * Pure types with no runtime side effects so this module stays cheap to
 * import everywhere.
 */

/**
 * Options for filtering packages by git changes.
 *
 * Used to determine which packages in a monorepo have changed files.
 *
 * @example
 * ```typescript
 * // Filter packages with changes
 * const changed = filterPackagesByChanges(packages)
 *
 * // Force include all packages
 * const all = filterPackagesByChanges(packages, { force: true })
 *
 * // Use custom package key
 * const changed = filterPackagesByChanges(
 *   packages,
 *   { packageKey: 'directory' }
 * )
 * ```
 */
export interface FilterPackagesByChangesOptions {
  /**
   * Force include all packages regardless of changes.
   *
   * @default false
   */
  force?: boolean | undefined
  /**
   * Key to access package path in package objects.
   *
   * @default 'path'
   */
  packageKey?: string | undefined
  /**
   * Additional options for filtering.
   */
  [key: string]: unknown
}

/**
 * Options for git diff operations.
 *
 * Controls how git diff results are processed and returned.
 *
 * @example
 * ```typescript
 * // Get absolute file paths
 * const files = await getChangedFiles({ absolute: true })
 * // => ['/path/to/repo/src/file.ts']
 *
 * // Get relative paths with caching disabled
 * const files = await getChangedFiles({ cache: false })
 * // => ['src/file.ts']
 *
 * // Get files from specific directory
 * const files = await getChangedFiles({ cwd: '/path/to/repo/src' })
 * ```
 */
export interface GitDiffOptions {
  /**
   * Return absolute file paths instead of relative paths.
   *
   * @default false
   */
  absolute?: boolean | undefined
  /**
   * Return results as a `Set` instead of an array.
   *
   * @default false
   */
  asSet?: boolean | undefined
  /**
   * Cache git diff results to avoid repeated git subprocess calls.
   *
   * Caching is keyed by the git command and options used, so different
   * option combinations maintain separate cache entries.
   *
   * @default true
   */
  cache?: boolean | undefined
  /**
   * Working directory for git operations.
   *
   * Git operations will be run from this directory, and returned paths
   * will be relative to the git repository root. Symlinks are resolved
   * using `fs.realpathSync()`.
   *
   * @default process.cwd()
   */
  cwd?: string | undefined
  /**
   * Parse git porcelain format output (status codes like `M`, `A`, `??`).
   *
   * When `true`, strips the two-character status code and space from the
   * beginning of each line. Automatically enabled for `getChangedFiles()`.
   *
   * @default false
   */
  porcelain?: boolean | undefined
  /**
   * Additional options passed to glob matcher.
   *
   * Supports options like `dot`, `ignore`, `nocase` for filtering results.
   */
  [key: string]: unknown
}
