/**
 * @file Public type surface for `globs/*` modules — the `Pattern` alias, the
 *   `FastGlobOptions` mirror of fast-glob's option surface, and the
 *   `GlobOptions` extension that adds Socket-specific `recursive` /
 *   `ignoreOriginals` flags. Pure types, no runtime side effects.
 */

export type Pattern = string

export interface FastGlobOptions {
  absolute?: boolean | undefined
  baseNameMatch?: boolean | undefined
  braceExpansion?: boolean | undefined
  caseSensitiveMatch?: boolean | undefined
  concurrency?: number | undefined
  cwd?: string | undefined
  deep?: number | undefined
  dot?: boolean | undefined
  extglob?: boolean | undefined
  followSymbolicLinks?: boolean | undefined
  fs?: unknown | undefined
  globstar?: boolean | undefined
  ignore?: string[] | undefined
  ignoreFiles?: string[] | undefined
  markDirectories?: boolean | undefined
  objectMode?: boolean | undefined
  onlyDirectories?: boolean | undefined
  onlyFiles?: boolean | undefined
  stats?: boolean | undefined
  suppressErrors?: boolean | undefined
  throwErrorOnBrokenSymbolicLink?: boolean | undefined
  unique?: boolean | undefined
}

export interface GlobOptions extends FastGlobOptions {
  ignoreOriginals?: boolean | undefined
  recursive?: boolean | undefined
}
