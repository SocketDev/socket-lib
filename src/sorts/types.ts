/**
 * @file Public type surface for `sorts/*` modules — the `FastSortFunction`
 *   shape returned by `naturalSorter`. Pure types, no runtime side effects.
 */

import type * as fastSortType from '../external/fast-sort'

// Type for fast-sort sorter function.
export type FastSortFunction = ReturnType<
  typeof import('fast-sort').createNewSortInstance
>

export type { fastSortType }
