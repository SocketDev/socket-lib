/**
 * @fileoverview Word-case helpers — `capitalize()` produces an
 * upper-first / lower-rest variant that iterates by code point so
 * surrogate pairs aren't split.
 */

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
