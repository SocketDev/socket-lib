/**
 * @file Mutation helpers — `incrementVersion` bumps a version by release type
 *   ('major' | 'minor' | 'patch' | 'pre*'), and `versionDiff` returns the kind
 *   of step between two versions. Both use the vendored `semver` directly
 *   because the increment / diff APIs aren't on the smol-versions surface.
 */

import { getSemver } from './_internal'

/**
 * Increment a version by the specified release type.
 *
 * @example
 *   ;```typescript
 *   incrementVersion('1.2.3', 'patch') // '1.2.4'
 *   incrementVersion('1.2.3', 'minor') // '1.3.0'
 *   incrementVersion('1.2.3', 'major') // '2.0.0'
 *   ```
 */
export function incrementVersion(
  version: string,
  release:
    | 'major'
    | 'minor'
    | 'patch'
    | 'premajor'
    | 'preminor'
    | 'prepatch'
    | 'prerelease',
  identifier?: string | undefined,
): string | undefined {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  return semver.inc(version, release, identifier) || undefined
}

/**
 * Get the difference between two versions.
 *
 * @example
 *   ;```typescript
 *   versionDiff('1.0.0', '2.0.0') // 'major'
 *   versionDiff('1.0.0', '1.1.0') // 'minor'
 *   versionDiff('1.0.0', '1.0.1') // 'patch'
 *   ```
 */
export function versionDiff(
  version1: string,
  version2: string,
):
  | 'major'
  | 'premajor'
  | 'minor'
  | 'preminor'
  | 'patch'
  | 'prepatch'
  | 'prerelease'
  | 'release'
  | undefined {
  try {
    /* c8 ignore next - External semver call */
    const semver = getSemver()
    return semver.diff(version1, version2) || undefined
  } catch {
    return undefined
  }
}
