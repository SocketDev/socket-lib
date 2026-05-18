/**
 * @file Version comparison operators aligned with `node:smol-versions` (the
 *   C++-accelerated multi-ecosystem version helper shipped by the smol Node
 *   binary). The same names + signatures also match the vendored `semver` JS
 *   lib — both impls expose this surface, so we pick one at module load (`impl
 *   = smol ?? semver`) and each export just forwards to it.
 *
 *   - `compare(a, b)` — returns `-1 | 0 | 1` (undefined on invalid input)
 *   - `eq(a, b)`, `neq(a, b)` — equality / inequality
 *   - `lt(a, b)`, `lte(a, b)` — less-than / less-or-equal
 *   - `gt(a, b)`, `gte(a, b)` — greater-than / greater-or-equal
 *   - `sort(versions)` — ascending sort
 *   - `rsort(versions)` — descending sort `compare()` swallows the smol/semver
 *     "invalid version" throw into `undefined` for the caller's convenience;
 *     all other ops surface whatever the underlying impl returns. The vendored
 *     `semver` export has no `neq` helper, so when we fall back to it we route
 *     `neq` through `!eq` to match smol's semantics.
 */

import { impl } from './_internal'

/**
 * Compare two semantic version strings.
 *
 * @returns -1 if a < b, 0 if a === b, 1 if a > b, or undefined if invalid.
 */
export function compare(a: string, b: string): -1 | 0 | 1 | undefined {
  try {
    return impl.compare(a, b) as -1 | 0 | 1
  } catch {
    return undefined
  }
}

/**
 * Check if a equals b.
 */
export const eq: (a: string, b: string) => boolean = impl.eq.bind(impl)

/**
 * Check if a does not equal b.
 */
export const neq: (a: string, b: string) => boolean =
  typeof (impl as { neq?: unknown }).neq === 'function'
    ? (impl as { neq: (a: string, b: string) => boolean }).neq.bind(impl)
    : (a, b) => !impl.eq(a, b)

/**
 * Check if a is greater than b.
 */
export const gt: (a: string, b: string) => boolean = impl.gt.bind(impl)

/**
 * Check if a is greater than or equal to b.
 */
export const gte: (a: string, b: string) => boolean = impl.gte.bind(impl)

/**
 * Check if a is less than b.
 */
export const lt: (a: string, b: string) => boolean = impl.lt.bind(impl)

/**
 * Check if a is less than or equal to b.
 */
export const lte: (a: string, b: string) => boolean = impl.lte.bind(impl)

/**
 * Sort versions in descending order.
 */
export function rsort(versions: readonly string[]): string[] {
  return impl.rsort([...versions])
}

/**
 * Sort versions in ascending order. The input is spread so callers can pass a
 * `readonly string[]` even when the impl mutates internally.
 */
export function sort(versions: readonly string[]): string[] {
  return impl.sort([...versions])
}
