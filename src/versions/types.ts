/**
 * @file Public type surface for `versions/*` modules — the parsed-version shape
 *   returned by `parseVersion` (a stable subset of semver's SemVer instance,
 *   exposed as a structural type rather than leaking the upstream class). Pure
 *   types, no runtime side effects.
 */

export interface ParsedVersion {
  major: number
  minor: number
  patch: number
  prerelease: ReadonlyArray<string | number>
  build: readonly string[]
}
