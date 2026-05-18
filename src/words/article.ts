/**
 * @file Indefinite-article picker — `determineArticle()` returns `'a'` or
 *   `'an'` based on the leading vowel of a word.
 */

/**
 * Determine the appropriate article (a/an) for a word.
 *
 * @example
 *   ;```typescript
 *   determineArticle('apple') // 'an'
 *   determineArticle('banana') // 'a'
 *   ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function determineArticle(word: string): string {
  // Case-insensitive so `Apple` and `apple` both pick `an`. Strict
  // spelling rules can't handle silent-h / y-sound exceptions (hour,
  // user); documenting that as a known limitation rather than shipping
  // a multi-entry exception list.
  return /^[aeiou]/i.test(word) ? 'an' : 'a'
}
