/**
 * @fileoverview Version comparison operators aligned with
 * `node:smol-versions` (the C++-accelerated multi-ecosystem version
 * helper shipped by the smol Node binary). The same names + signatures
 * also match the `semver` JS lib — both impls expose this surface, so
 * `getVersionsImpl()` swaps between them at runtime without callers
 * caring which is active.
 *
 *   - `compare(a, b)` — returns `-1 | 0 | 1`
 *   - `eq(a, b)`, `neq(a, b)`         — equality / inequality
 *   - `lt(a, b)`, `lte(a, b)`         — less-than / less-or-equal
 *   - `gt(a, b)`, `gte(a, b)`         — greater-than / greater-or-equal
 *   - `sort(versions)`                — ascending sort
 *   - `rsort(versions)`               — descending sort
 *
 * The `compare()` return is tightened to `-1 | 0 | 1 | undefined` here
 * (smol-versions can throw on malformed input; this wrapper swallows
 * to undefined for the caller's convenience).
 */

import { getVersionsImpl } from './_internal'

/**
 * Compare two semantic version strings.
 * @returns -1 if a < b, 0 if a === b, 1 if a > b, or undefined if invalid.
 *
 * @example
 * ```typescript
 * compare('1.0.0', '2.0.0') // -1
 * compare('1.0.0', '1.0.0') // 0
 * compare('2.0.0', '1.0.0') // 1
 * ```
 */
export function compare(a: string, b: string): -1 | 0 | 1 | undefined {
  try {
    /* c8 ignore next - External semver call */
    return getVersionsImpl().compare(a, b) as -1 | 0 | 1
  } catch {
    return undefined
  }
}

/**
 * Check if a equals b.
 *
 * @example
 * ```typescript
 * eq('1.0.0', '1.0.0') // true
 * eq('1.0.0', '2.0.0') // false
 * ```
 */
export function eq(a: string, b: string): boolean {
  /* c8 ignore next - External semver call */
  return getVersionsImpl().eq(a, b)
}

/**
 * Check if a does not equal b.
 *
 * @example
 * ```typescript
 * neq('1.0.0', '2.0.0') // true
 * neq('1.0.0', '1.0.0') // false
 * ```
 */
export function neq(a: string, b: string): boolean {
  const impl = getVersionsImpl()
  /* c8 ignore start - External semver call; .neq exists on
     smol-versions but not on the vendored semver export — fall back
     to !eq when missing. */
  if (typeof (impl as { neq?: unknown }).neq === 'function') {
    return (impl as { neq: (a: string, b: string) => boolean }).neq(a, b)
  }
  return !impl.eq(a, b)
  /* c8 ignore stop */
}

/**
 * Check if a is greater than b.
 *
 * @example
 * ```typescript
 * gt('2.0.0', '1.0.0') // true
 * gt('1.0.0', '2.0.0') // false
 * ```
 */
export function gt(a: string, b: string): boolean {
  /* c8 ignore next - External semver call */
  return getVersionsImpl().gt(a, b)
}

/**
 * Check if a is greater than or equal to b.
 *
 * @example
 * ```typescript
 * gte('2.0.0', '1.0.0') // true
 * gte('1.0.0', '1.0.0') // true
 * ```
 */
export function gte(a: string, b: string): boolean {
  /* c8 ignore next - External semver call */
  return getVersionsImpl().gte(a, b)
}

/**
 * Check if a is less than b.
 *
 * @example
 * ```typescript
 * lt('1.0.0', '2.0.0') // true
 * lt('2.0.0', '1.0.0') // false
 * ```
 */
export function lt(a: string, b: string): boolean {
  /* c8 ignore next - External semver call */
  return getVersionsImpl().lt(a, b)
}

/**
 * Check if a is less than or equal to b.
 *
 * @example
 * ```typescript
 * lte('1.0.0', '2.0.0') // true
 * lte('1.0.0', '1.0.0') // true
 * ```
 */
export function lte(a: string, b: string): boolean {
  /* c8 ignore next - External semver call */
  return getVersionsImpl().lte(a, b)
}

/**
 * Sort versions in ascending order.
 *
 * @example
 * ```typescript
 * sort(['2.0.0', '1.0.0', '1.5.0'])
 * // ['1.0.0', '1.5.0', '2.0.0']
 * ```
 */
export function sort(versions: readonly string[]): string[] {
  /* c8 ignore next - External semver call */
  return getVersionsImpl().sort([...versions])
}

/**
 * Sort versions in descending order.
 *
 * @example
 * ```typescript
 * rsort(['1.0.0', '2.0.0', '1.5.0'])
 * // ['2.0.0', '1.5.0', '1.0.0']
 * ```
 */
export function rsort(versions: readonly string[]): string[] {
  /* c8 ignore next - External semver call */
  return getVersionsImpl().rsort([...versions])
}
