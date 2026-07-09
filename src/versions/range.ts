/**
 * @file Range / set helpers — `satisfiesVersion` / `filterVersions` check
 *   membership against a semver range, `maxVersion` / `minVersion` pick the
 *   bounds of an arbitrary version array. The bound pickers use the vendored
 *   `semver` directly because the prerelease-inclusion options aren't part of
 *   the smol-versions surface.
 */

import { getImpl, getSemver } from './_internal'

/**
 * Get all versions from an array that satisfy a semver range.
 *
 * @example
 *   ;```typescript
 *   filterVersions(['1.0.0', '1.5.0', '2.0.0'], '>=1.0.0 <2.0.0')
 *   // ['1.0.0', '1.5.0']
 *   ```
 */
export function filterVersions(versions: string[], range: string): string[] {
  /* c8 ignore next - External semver call */
  const impl = getImpl()
  return versions.filter(v => impl.satisfies(v, range))
}

/**
 * Get the highest version from an array of versions.
 *
 * @example
 *   ;```typescript
 *   maxVersion(['1.0.0', '2.0.0', '1.5.0']) // '2.0.0'
 *   ```
 */
export function maxVersion(versions: string[]): string | undefined {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  // includePrerelease: true so an all-prerelease input like
  // ['1.0.0-alpha', '1.0.0-beta'] resolves to the latest prerelease
  // instead of returning undefined under semver's default (which filters
  // prereleases out against '*').
  return (
    semver.maxSatisfying(versions, '*', { includePrerelease: true }) ||
    undefined
  )
}

/**
 * Get the lowest version from an array of versions.
 *
 * @example
 *   ;```typescript
 *   minVersion(['1.0.0', '2.0.0', '1.5.0']) // '1.0.0'
 *   ```
 */
export function minVersion(versions: string[]): string | undefined {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  return (
    semver.minSatisfying(versions, '*', { includePrerelease: true }) ||
    undefined
  )
}

/**
 * Check if a version satisfies a semver range.
 *
 * @example
 *   ;```typescript
 *   satisfiesVersion('1.5.0', '>=1.0.0 <2.0.0') // true
 *   satisfiesVersion('3.0.0', '>=1.0.0 <2.0.0') // false
 *   ```
 */
export function satisfiesVersion(version: string, range: string): boolean {
  /* c8 ignore next - External semver call */
  return getImpl().satisfies(version, range)
}
