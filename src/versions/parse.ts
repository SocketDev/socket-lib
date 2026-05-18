/**
 * @file Parsing helpers — `coerceVersion` rounds a sloppy input ("1.2") up to a
 *   valid semver triple, `parseVersion` returns `{major, minor, patch,
 *   prerelease, build}`, and the `getMajor*` / `getMinor*` / `getPatchVersion`
 *   accessors return a single component. `isValidVersion` is also here because
 *   validation is effectively "did parse succeed". All go through the vendored
 *   `semver` directly — smol-versions doesn't expose the parsed shape.
 */

import { getSemver, impl } from './_internal'

import type { ParsedVersion } from './types'

/**
 * Coerce a version string to valid semver format.
 *
 * @example
 *   ;```typescript
 *   coerceVersion('1.2') // '1.2.0'
 *   coerceVersion('v3') // '3.0.0'
 *   coerceVersion('abc') // undefined
 *   ```
 */
export function coerceVersion(version: string): string | undefined {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  const coerced = semver.coerce(version)
  return coerced?.version
}

/**
 * Get the major version number from a version string.
 *
 * @example
 *   ;```typescript
 *   getMajorVersion('3.2.1') // 3
 *   ```
 */
export function getMajorVersion(version: string): number | undefined {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  const parsed = semver.parse(version)
  return parsed?.major
}

/**
 * Get the minor version number from a version string.
 *
 * @example
 *   ;```typescript
 *   getMinorVersion('3.2.1') // 2
 *   ```
 */
export function getMinorVersion(version: string): number | undefined {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  const parsed = semver.parse(version)
  return parsed?.minor
}

/**
 * Get the patch version number from a version string.
 *
 * @example
 *   ;```typescript
 *   getPatchVersion('3.2.1') // 1
 *   ```
 */
export function getPatchVersion(version: string): number | undefined {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  const parsed = semver.parse(version)
  return parsed?.patch
}

/**
 * Validate if a string is a valid semantic version.
 *
 * @example
 *   ;```typescript
 *   isValidVersion('1.2.3') // true
 *   isValidVersion('abc') // false
 *   ```
 */
export function isValidVersion(version: string): boolean {
  /* c8 ignore next - External semver call */
  // semver.valid returns string | null; smol-versions returns
  // string | undefined. Both branch correctly under loose-equality
  // truthiness check, so a generic `!= null` (loose) covers both.
  // eslint-disable-next-line eqeqeq
  return impl.valid(version) != null
}

/**
 * Parse a version string and return major, minor, patch components.
 *
 * @example
 *   ;```typescript
 *   parseVersion('1.2.3')
 *   // { major: 1, minor: 2, patch: 3, prerelease: [], build: [] }
 *   ```
 */
export function parseVersion(version: string): ParsedVersion | undefined {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  const parsed = semver.parse(version)
  if (!parsed) {
    return undefined
  }
  return {
    major: parsed.major,
    minor: parsed.minor,
    patch: parsed.patch,
    prerelease: parsed.prerelease,
    build: parsed.build,
  }
}
