/**
 * @fileoverview Public type surface for `bin/*` modules — the
 * `WhichOptions` interface that callers pass to `which`, `whichSync`,
 * `whichReal`, and `whichRealSync`. Pure types, no runtime side effects.
 */

/**
 * Options for the which function.
 */
export interface WhichOptions {
  /** If true, return all matches instead of just the first one. */
  all?: boolean | undefined
  /** If true, return null instead of throwing when no match is found. */
  nothrow?: boolean | undefined
  /** Path to search in. */
  path?: string | undefined
  /** Path separator character. */
  pathExt?: string | undefined
  /** Environment variables to use. */
  env?: Record<string, string | undefined> | undefined
  /** Current working directory for resolving relative paths. */
  cwd?: string | undefined
}
