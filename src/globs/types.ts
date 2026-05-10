/**
 * @fileoverview Public type surface for `globs/*` modules.
 */

export type Pattern = string

export interface FastGlobOptions {
  absolute?: boolean
  baseNameMatch?: boolean
  braceExpansion?: boolean
  caseSensitiveMatch?: boolean
  concurrency?: number
  cwd?: string
  deep?: number
  dot?: boolean
  extglob?: boolean
  followSymbolicLinks?: boolean
  fs?: unknown
  globstar?: boolean
  ignore?: string[]
  ignoreFiles?: string[]
  markDirectories?: boolean
  objectMode?: boolean
  onlyDirectories?: boolean
  onlyFiles?: boolean
  stats?: boolean
  suppressErrors?: boolean
  throwErrorOnBrokenSymbolicLink?: boolean
  unique?: boolean
}

export interface GlobOptions extends FastGlobOptions {
  ignoreOriginals?: boolean
  recursive?: boolean
}
