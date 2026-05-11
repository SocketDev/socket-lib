/**
 * @fileoverview Plain string comparison. The straight-ASCII
 * three-way compare, no locale/numeric awareness — use
 * `localeCompare` / `naturalCompare` from the sibling files when
 * those matter.
 */

/**
 * Simple string comparison.
 *
 * @example
 * ```typescript
 * compareStr('a', 'b')  // -1
 * compareStr('b', 'a')  // 1
 * compareStr('a', 'a')  // 0
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function compareStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}
