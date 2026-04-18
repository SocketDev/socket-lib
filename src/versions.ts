/** @fileoverview Version comparison and validation utilities for Socket ecosystem. */

import type * as semverType from './external/semver'

let _semver: typeof semverType | undefined
function getSemver() {
  if (_semver === undefined) {
    _semver = require('./external/semver')
  }
  return _semver!
}

/**
 * Coerce a version string to valid semver format.
 *
 * @example
 * ```typescript
 * coerceVersion('1.2')   // '1.2.0'
 * coerceVersion('v3')    // '3.0.0'
 * coerceVersion('abc')   // undefined
 * ```
 */
export function coerceVersion(version: string): string | undefined {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  const coerced = semver.coerce(version)
  return coerced?.version
}

/**
 * Compare two semantic version strings.
 * @returns -1 if v1 < v2, 0 if v1 === v2, 1 if v1 > v2, or undefined if invalid.
 *
 * @example
 * ```typescript
 * compareVersions('1.0.0', '2.0.0') // -1
 * compareVersions('1.0.0', '1.0.0') // 0
 * compareVersions('2.0.0', '1.0.0') // 1
 * ```
 */
export function compareVersions(
  v1: string,
  v2: string,
): -1 | 0 | 1 | undefined {
  try {
    /* c8 ignore next - External semver call */
    const semver = getSemver()
    return semver.compare(v1, v2)
  } catch {
    return undefined
  }
}

/**
 * Get all versions from an array that satisfy a semver range.
 *
 * @example
 * ```typescript
 * filterVersions(['1.0.0', '1.5.0', '2.0.0'], '>=1.0.0 <2.0.0')
 * // ['1.0.0', '1.5.0']
 * ```
 */
export function filterVersions(versions: string[], range: string): string[] {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  return versions.filter(v => semver.satisfies(v, range))
}

/**
 * Get the major version number from a version string.
 *
 * @example
 * ```typescript
 * getMajorVersion('3.2.1') // 3
 * ```
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
 * ```typescript
 * getMinorVersion('3.2.1') // 2
 * ```
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
 * ```typescript
 * getPatchVersion('3.2.1') // 1
 * ```
 */
export function getPatchVersion(version: string): number | undefined {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  const parsed = semver.parse(version)
  return parsed?.patch
}

/**
 * Increment a version by the specified release type.
 *
 * @example
 * ```typescript
 * incrementVersion('1.2.3', 'patch') // '1.2.4'
 * incrementVersion('1.2.3', 'minor') // '1.3.0'
 * incrementVersion('1.2.3', 'major') // '2.0.0'
 * ```
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
 * Check if version1 equals version2.
 *
 * @example
 * ```typescript
 * isEqual('1.0.0', '1.0.0') // true
 * isEqual('1.0.0', '2.0.0') // false
 * ```
 */
export function isEqual(version1: string, version2: string): boolean {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  return semver.eq(version1, version2)
}

/**
 * Check if version1 is greater than version2.
 *
 * @example
 * ```typescript
 * isGreaterThan('2.0.0', '1.0.0') // true
 * isGreaterThan('1.0.0', '2.0.0') // false
 * ```
 */
export function isGreaterThan(version1: string, version2: string): boolean {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  return semver.gt(version1, version2)
}

/**
 * Check if version1 is greater than or equal to version2.
 *
 * @example
 * ```typescript
 * isGreaterThanOrEqual('2.0.0', '1.0.0') // true
 * isGreaterThanOrEqual('1.0.0', '1.0.0') // true
 * ```
 */
export function isGreaterThanOrEqual(
  version1: string,
  version2: string,
): boolean {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  return semver.gte(version1, version2)
}

/**
 * Check if version1 is less than version2.
 *
 * @example
 * ```typescript
 * isLessThan('1.0.0', '2.0.0') // true
 * isLessThan('2.0.0', '1.0.0') // false
 * ```
 */
export function isLessThan(version1: string, version2: string): boolean {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  return semver.lt(version1, version2)
}

/**
 * Check if version1 is less than or equal to version2.
 *
 * @example
 * ```typescript
 * isLessThanOrEqual('1.0.0', '2.0.0') // true
 * isLessThanOrEqual('1.0.0', '1.0.0') // true
 * ```
 */
export function isLessThanOrEqual(version1: string, version2: string): boolean {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  return semver.lte(version1, version2)
}

/**
 * Validate if a string is a valid semantic version.
 *
 * @example
 * ```typescript
 * isValidVersion('1.2.3') // true
 * isValidVersion('abc')   // false
 * ```
 */
export function isValidVersion(version: string): boolean {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  return semver.valid(version) !== null
}

/**
 * Get the highest version from an array of versions.
 *
 * @example
 * ```typescript
 * maxVersion(['1.0.0', '2.0.0', '1.5.0']) // '2.0.0'
 * ```
 */
export function maxVersion(versions: string[]): string | undefined {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  return semver.maxSatisfying(versions, '*') || undefined
}

/**
 * Get the lowest version from an array of versions.
 *
 * @example
 * ```typescript
 * minVersion(['1.0.0', '2.0.0', '1.5.0']) // '1.0.0'
 * ```
 */
export function minVersion(versions: string[]): string | undefined {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  return semver.minSatisfying(versions, '*') || undefined
}

/**
 * Parse a version string and return major, minor, patch components.
 *
 * @example
 * ```typescript
 * parseVersion('1.2.3')
 * // { major: 1, minor: 2, patch: 3, prerelease: [], build: [] }
 * ```
 */
export function parseVersion(version: string):
  | {
      major: number
      minor: number
      patch: number
      prerelease: ReadonlyArray<string | number>
      build: readonly string[]
    }
  | undefined {
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

/**
 * Check if a version satisfies a semver range.
 *
 * @example
 * ```typescript
 * satisfiesVersion('1.5.0', '>=1.0.0 <2.0.0') // true
 * satisfiesVersion('3.0.0', '>=1.0.0 <2.0.0') // false
 * ```
 */
export function satisfiesVersion(version: string, range: string): boolean {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  return semver.satisfies(version, range)
}

/**
 * Sort versions in ascending order.
 *
 * @example
 * ```typescript
 * sortVersions(['2.0.0', '1.0.0', '1.5.0'])
 * // ['1.0.0', '1.5.0', '2.0.0']
 * ```
 */
export function sortVersions(versions: string[]): string[] {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  return semver.sort([...versions])
}

/**
 * Sort versions in descending order.
 *
 * @example
 * ```typescript
 * sortVersionsDesc(['1.0.0', '2.0.0', '1.5.0'])
 * // ['2.0.0', '1.5.0', '1.0.0']
 * ```
 */
export function sortVersionsDesc(versions: string[]): string[] {
  /* c8 ignore next - External semver call */
  const semver = getSemver()
  return semver.rsort([...versions])
}

/**
 * Get the difference between two versions.
 *
 * @example
 * ```typescript
 * versionDiff('1.0.0', '2.0.0') // 'major'
 * versionDiff('1.0.0', '1.1.0') // 'minor'
 * versionDiff('1.0.0', '1.0.1') // 'patch'
 * ```
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
