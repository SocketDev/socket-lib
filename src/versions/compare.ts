/**
 * @fileoverview Comparison operators — `compareVersions` returns
 * `-1 | 0 | 1`, the `is*Than*` predicates wrap the underlying
 * binary comparators, and `sortVersions` / `sortVersionsDesc`
 * apply them across an array. All go through `getVersionsImpl()`
 * so smol-versions wins on the smol Node binary.
 */

import { getVersionsImpl } from './_internal'

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
    const impl = getVersionsImpl()
    return impl.compare(v1, v2) as -1 | 0 | 1
  } catch {
    return undefined
  }
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
  const impl = getVersionsImpl()
  return impl.eq(version1, version2)
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
  const impl = getVersionsImpl()
  return impl.gt(version1, version2)
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
  const impl = getVersionsImpl()
  return impl.gte(version1, version2)
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
  const impl = getVersionsImpl()
  return impl.lt(version1, version2)
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
  const impl = getVersionsImpl()
  return impl.lte(version1, version2)
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
  const impl = getVersionsImpl()
  return impl.sort([...versions])
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
  const impl = getVersionsImpl()
  return impl.rsort([...versions])
}
