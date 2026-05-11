/**
 * @fileoverview Simple count-based pluralization helper — appends a
 * trailing `'s'` when the count is anything other than 1.
 */

import type { PluralizeOptions } from './types'

/**
 * Pluralize a word based on count.
 *
 * @example
 * ```typescript
 * pluralize('file')               // 'file'
 * pluralize('file', { count: 3 }) // 'files'
 * pluralize('file', { count: 0 }) // 'files'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function pluralize(
  word: string,
  options?: PluralizeOptions | undefined,
): string {
  const { count = 1 } = { __proto__: null, ...options } as PluralizeOptions
  // Handle 0, negatives, decimals, and values > 1 as plural.
  return count === 1 ? word : `${word}s`
}
