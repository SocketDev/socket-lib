/**
 * @file Public type surface for `sorts/*` modules — the `FastSortFunction`
 *   shape returned by `naturalSorter`. Pure types, no runtime side effects.
 */

// oxlint-disable-next-line socket/no-namespace-import -- type-only namespace re-exported as the module's type surface (`export type { fastSortType }`); no named-export equivalent
import type * as fastSortType from '../external/fast-sort'

// Type for fast-sort sorter function.
export type FastSortFunction = ReturnType<
  typeof fastSortType.createNewSortInstance
>

export type { fastSortType }
