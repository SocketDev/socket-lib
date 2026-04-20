/**
 * @fileoverview Word manipulation utilities for capitalization and formatting.
 * Provides text transformation functions for consistent word processing.
 */

export interface PluralizeOptions {
  count?: number
}

/**
 * Capitalize the first letter of a word.
 *
 * @example
 * ```typescript
 * capitalize('hello')  // 'Hello'
 * capitalize('WORLD')  // 'World'
 * capitalize('')       // ''
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function capitalize(word: string): string {
  if (word.length === 0) {
    return word
  }
  // Iterate by code point, not UTF-16 unit, so non-BMP characters
  // (emoji, astral-plane scripts) aren't split between their surrogate
  // pair halves. `charAt(0).toUpperCase() + slice(1).toLowerCase()` used
  // to produce broken surrogate pairs for inputs like '𐐀foo'.
  const [first, ...rest] = [...word]
  return (first ?? '').toUpperCase() + rest.join('').toLowerCase()
}

/**
 * Determine the appropriate article (a/an) for a word.
 *
 * @example
 * ```typescript
 * determineArticle('apple')   // 'an'
 * determineArticle('banana')  // 'a'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function determineArticle(word: string): string {
  // Case-insensitive so `Apple` and `apple` both pick `an`. Strict
  // spelling rules can't handle silent-h / y-sound exceptions (hour,
  // user); documenting that as a known limitation rather than shipping
  // a multi-entry exception list.
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}

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
