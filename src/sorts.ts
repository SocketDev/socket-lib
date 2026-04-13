/**
 * @fileoverview Sorting comparison functions including locale-aware and natural sorting.
 * Provides various comparison utilities for arrays and collections.
 */

import type * as fastSortType from './external/fast-sort.js'
import type * as semverType from './external/semver.js'

let _semver: typeof semverType | undefined
function getSemver() {
  if (_semver === undefined) {
    _semver = require('./external/semver.js')
  }
  return _semver!
}

let _fastSort: typeof fastSortType | undefined
function getFastSort() {
  if (_fastSort === undefined) {
    _fastSort = require('./external/fast-sort.js')
  }
  return _fastSort!
}

/**
 * Compare semantic versions.
 *
 * @example
 * ```typescript
 * compareSemver('1.0.0', '2.0.0')  // -1
 * compareSemver('2.0.0', '1.0.0')  // 1
 * compareSemver('1.0.0', '1.0.0')  // 0
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function compareSemver(a: string, b: string): number {
  /* c8 ignore next 2 - External semver calls */
  const semver = getSemver()
  const validA: string | null = semver.valid(a)
  const validB: string | null = semver.valid(b)

  if (!validA && !validB) {
    return 0
  }
  if (!validA) {
    return -1
  }
  if (!validB) {
    return 1
  }
  /* c8 ignore next - External semver call */
  return semver.compare(a, b) as number
}

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

let _localeCompare: ((x: string, y: string) => number) | undefined
/**
 * Compare two strings using locale-aware comparison.
 *
 * @example
 * ```typescript
 * localeCompare('a', 'b')  // -1
 * localeCompare('b', 'a')  // 1
 * localeCompare('a', 'a')  // 0
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function localeCompare(x: string, y: string): number {
  if (_localeCompare === undefined) {
    // Lazily call new Intl.Collator() because in Node it can take 10-14ms.
    _localeCompare = new Intl.Collator().compare
  }
  return _localeCompare(x, y)
}

let _naturalCompare: ((x: string, y: string) => number) | undefined
/**
 * Compare two strings using natural sorting (numeric-aware, case-insensitive).
 *
 * @example
 * ```typescript
 * naturalCompare('file2', 'file10')  // negative (file2 before file10)
 * naturalCompare('img10', 'img2')    // positive (img10 after img2)
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function naturalCompare(x: string, y: string): number {
  if (_naturalCompare === undefined) {
    // Lazily call new Intl.Collator() because in Node it can take 10-14ms.
    _naturalCompare = new Intl.Collator(
      // The `undefined` locale means it uses the default locale of the user's
      // environment.
      undefined,
      {
        // Enables numeric sorting: numbers in strings are compared by value,
        // e.g. 'file2' comes before 'file10' as numbers and not 'file10' before
        // 'file2' as plain text.
        numeric: true,
        // Makes the comparison case-insensitive and ignores diacritics, e.g.
        // 'a', 'A', and 'á' are treated as equivalent.
        sensitivity: 'base',
      },
    ).compare
  }
  return _naturalCompare(x, y)
}

// Type for fast-sort sorter function.
type FastSortFunction = ReturnType<
  typeof import('fast-sort').createNewSortInstance
>

let _naturalSorter: FastSortFunction | undefined
/**
 * Sort an array using natural comparison.
 *
 * @example
 * ```typescript
 * naturalSorter(['file10', 'file2', 'file1']).asc()
 * // ['file1', 'file2', 'file10']
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function naturalSorter<T>(
  arrayToSort: T[],
): ReturnType<FastSortFunction> {
  if (_naturalSorter === undefined) {
    /* c8 ignore next 4 - External fast-sort call */
    const fastSort = getFastSort()
    _naturalSorter = fastSort.createNewSortInstance({
      comparer: naturalCompare,
    }) as FastSortFunction
  }
  return (_naturalSorter as FastSortFunction)(arrayToSort)
}
