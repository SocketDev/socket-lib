/**
 * @file Public type surface for `sorts/*` modules — the `FastSortFunction`
 *   shape returned by `naturalSorter`. Pure types, no runtime side effects.
 */

// Type-only namespace re-exported as the module's type surface via
// `export type { fastSortType }`; no named-export equivalent.
// oxlint-disable-next-line socket/no-namespace-import -- type-only namespace
import type * as fastSortType from '../external/fast-sort'

// Type for fast-sort sorter function.
export type FastSortFunction = ReturnType<
  typeof fastSortType.createNewSortInstance
>

export type { fastSortType }
