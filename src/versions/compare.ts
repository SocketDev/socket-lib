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
 *     `neq` through `!eq` to match smol's semantics. Snapshot safety: each
 *     export is a thin forwarding function that resolves `getImpl()` at FIRST
 *     CALL, not at module-eval. Binding the impl methods at module load
 *     (`impl.eq.bind(impl)`) pinned the native-handle-bearing semver/npm-pack
 *     bundle into the heap and aborted `node --build-snapshot`.
 */

import { getImpl } from './_internal'

/**
 * Compare two semantic version strings.
 *
 * @returns -1 if a < b, 0 if a === b, 1 if a > b, or undefined if invalid.
 */
export function compare(a: string, b: string): -1 | 0 | 1 | undefined {
  try {
    return getImpl().compare(a, b) as -1 | 0 | 1
  } catch {
    return undefined
  }
}

/**
 * Check if a equals b.
 */
export function eq(a: string, b: string): boolean {
  return getImpl().eq(a, b)
}

/**
 * Check if a is greater than b.
 */
export function gt(a: string, b: string): boolean {
  return getImpl().gt(a, b)
}

/**
 * Check if a is greater than or equal to b.
 */
export function gte(a: string, b: string): boolean {
  return getImpl().gte(a, b)
}

/**
 * Check if a is less than b.
 */
export function lt(a: string, b: string): boolean {
  return getImpl().lt(a, b)
}

/**
 * Check if a is less than or equal to b.
 */
export function lte(a: string, b: string): boolean {
  return getImpl().lte(a, b)
}

/**
 * Check if a does not equal b. The vendored `semver` export exposes no `neq`
 * helper, so on the fallback path we route through `!eq` to match smol's
 * semantics; smol-versions has a native `.neq` and uses it directly.
 */
export function neq(a: string, b: string): boolean {
  const impl = getImpl()
  /* c8 ignore start - smol-versions exposes .neq, so the native arm is taken;
     the polyfill fallback fires only on a hypothetical impl that lacks .neq. */
  if (typeof (impl as { neq?: unknown | undefined }).neq === 'function') {
    return (impl as { neq: (a: string, b: string) => boolean }).neq(a, b)
  }
  return !impl.eq(a, b)
  /* c8 ignore stop */
}

/**
 * Sort versions in descending order.
 */
export function rsort(versions: readonly string[]): string[] {
  return getImpl().rsort([...versions])
}

/**
 * Sort versions in ascending order. The input is spread so callers can pass a
 * `readonly string[]` even when the impl mutates internally.
 */
export function sort(versions: readonly string[]): string[] {
  // oxlint-disable-next-line unicorn/no-array-sort -- the smol/semver binding's own sort method, not Array#sort; the binding exposes no `toSorted`.
  return getImpl().sort([...versions])
}
