/**
 * @file Public type surface for `exe/*` modules — the `WhichOptions` interface
 *   that callers pass to `which`, `whichSync`, `whichReal`, and
 *   `whichRealSync`, plus the `whichLocalBin` variant. Pure types, no runtime
 *   side effects.
 */

/**
 * Options for the which function. Mirrors what the upstream `which` package
 * actually reads — it has no notion of a working directory, so there is no
 * `cwd` here. To search a specific directory, pass it as `path`.
 */
export interface WhichOptions {
  /**
   * If true, return all matches instead of just the first one.
   */
  all?: boolean | undefined
  /**
   * If true, return null instead of throwing when no match is found.
   */
  nothrow?: boolean | undefined
  /**
   * Path to search in.
   */
  path?: string | undefined
  /**
   * Path separator character.
   */
  pathExt?: string | undefined
  /**
   * Environment variables to use.
   */
  env?: Record<string, string | undefined> | undefined
}

/**
 * Options for `whichLocalBin`, which builds the directory it searches and so
 * can honor a project root.
 */
export interface WhichLocalBinOptions extends WhichOptions {
  /**
   * Project root whose `node_modules/.bin` is searched. Default
   * `process.cwd()`. Ignored when `path` is set.
   */
  cwd?: string | undefined
}
