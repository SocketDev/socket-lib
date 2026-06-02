/**
 * @file Locale-aware + numeric-aware comparison via `Intl.Collator`, plus the
 *   `naturalSorter` helper that wires the fast-sort engine to the natural
 *   comparator. Collator instances are lazy-created and cached because `new
 *   Intl.Collator()` is 10-14ms in Node — too expensive to call
 *   per-comparison.
 */

import { getFastSort } from './_internal'
import { IntlCollator } from '../primordials/intl'

import type { FastSortFunction } from './types'

let cachedLocaleCompare: ((x: string, y: string) => number) | undefined
let cachedNaturalCompare: ((x: string, y: string) => number) | undefined
let cachedNaturalSorter: FastSortFunction | undefined

/**
 * Compare two strings using locale-aware comparison.
 *
 * @example
 *   ;```typescript
 *   localeCompare('a', 'b') // -1
 *   localeCompare('b', 'a') // 1
 *   localeCompare('a', 'a') // 0
 *   ```
 */
export function localeCompare(x: string, y: string): number {
  if (cachedLocaleCompare === undefined) {
    // Lazily call new IntlCollator() because in Node it can take 10-14ms.
    cachedLocaleCompare = new IntlCollator().compare
  }
  return cachedLocaleCompare(x, y)
}

/**
 * Compare two strings using natural sorting (numeric-aware, case-insensitive).
 *
 * @example
 *   ;```typescript
 *   naturalCompare('file2', 'file10') // negative (file2 before file10)
 *   naturalCompare('img10', 'img2') // positive (img10 after img2)
 *   ```
 */
export function naturalCompare(x: string, y: string): number {
  if (cachedNaturalCompare === undefined) {
    // Lazily call new IntlCollator() because in Node it can take 10-14ms.
    cachedNaturalCompare = new IntlCollator(
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
  return cachedNaturalCompare(x, y)
}

/**
 * Sort an array using natural comparison.
 *
 * @example
 *   ;```typescript
 *   naturalSorter(['file10', 'file2', 'file1']).asc()
 *   // ['file1', 'file2', 'file10']
 *   ```
 */
export function naturalSorter<T>(
  arrayToSort: T[],
): ReturnType<FastSortFunction> {
  if (cachedNaturalSorter === undefined) {
    // External fast-sort call
    /* c8 ignore start - external fast-sort instance creation */
    const fastSort = getFastSort()
    cachedNaturalSorter = fastSort.createNewSortInstance({
      comparer: naturalCompare,
    }) as FastSortFunction
    /* c8 ignore stop */
  }
  return (cachedNaturalSorter as FastSortFunction)(arrayToSort)
}
