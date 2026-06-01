/**
 * @file `search` — like `String.prototype.search` but with a configurable
 *   starting index. The native `RegExp.exec` + `lastIndex` dance handles this,
 *   but with side-effect risk on shared regexes. This wrapper offers a clean,
 *   side-effect-free version.
 */

import { MathMax } from '../primordials/math'
import {
  StringPrototypeSearch,
  StringPrototypeSlice,
} from '../primordials/string'

import type { SearchOptions } from './types'

/**
 * Search for a regular expression in a string starting from an index.
 *
 * Similar to `String.prototype.search()` but allows specifying a starting
 * position. Returns the index of the first match at or after `fromIndex`, or -1
 * if no match is found. Negative `fromIndex` values count back from the end of
 * the string.
 *
 * This is more efficient than using `str.slice(fromIndex).search()` when you
 * need the absolute position in the original string, as it handles the offset
 * calculation for you.
 *
 * @example
 *   ;```ts
 *   search('hello world hello', /hello/, { fromIndex: 0 }) // 0
 *   search('hello world hello', /hello/, { fromIndex: 6 }) // 12
 *   search('hello world', /goodbye/, { fromIndex: 0 }) // -1
 *   search('hello world', /hello/, { fromIndex: -5 }) // -1
 *   ```
 *
 * @param str - The string to search in.
 * @param regexp - The regular expression to search for.
 * @param options - Configuration options.
 *
 * @returns The index of the first match, or -1 if not found
 */
export function search(
  str: string,
  regexp: RegExp,
  options?: SearchOptions | undefined,
): number {
  const { fromIndex = 0 } = { __proto__: null, ...options } as SearchOptions
  const { length } = str
  if (fromIndex >= length) {
    return -1
  }
  if (fromIndex === 0) {
    return StringPrototypeSearch(str, regexp)
  }
  const offset = fromIndex < 0 ? MathMax(length + fromIndex, 0) : fromIndex
  const result = StringPrototypeSlice(str, offset).search(regexp)
  return result === -1 ? -1 : result + offset
}
