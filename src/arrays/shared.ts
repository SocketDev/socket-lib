/**
 * @file Private internals for `arrays/*` modules — cached `Intl.ListFormat`
 *   instances for conjunction (and) and disjunction (or) joins. Constructed
 *   lazily because `new Intl.ListFormat(...)` is a measurable startup cost.
 */

import { IntlListFormat } from '../primordials/intl'

let conjunctionFormatter: Intl.ListFormat | undefined
let disjunctionFormatter: Intl.ListFormat | undefined

/**
 * Get a cached Intl.ListFormat instance for conjunction (and) formatting.
 *
 * Creates a singleton formatter for English "and" lists using the long style.
 * The formatter is lazily initialized on first use and reused for performance.
 *
 * @private
 *
 * @example
 *   ;```ts
 *   const formatter = getConjunctionFormatter()
 *   formatter.format(['apple', 'banana', 'cherry'])
 *   // Returns: "apple, banana, and cherry"
 *   ```
 *
 * @returns Cached Intl.ListFormat instance configured for conjunction
 *   formatting.
 */
export function getConjunctionFormatter() {
  if (conjunctionFormatter === undefined) {
    // Intl.ListFormat initialization
    /* c8 ignore start - lazy singleton init runs once; not worth a dedicated test */
    conjunctionFormatter = new IntlListFormat('en', {
      style: 'long',
      // "and" lists.
      type: 'conjunction',
    })
    /* c8 ignore stop */
  }
  return conjunctionFormatter
}

/**
 * Get a cached Intl.ListFormat instance for disjunction (or) formatting.
 *
 * Creates a singleton formatter for English "or" lists using the long style.
 * The formatter is lazily initialized on first use and reused for performance.
 *
 * @private
 *
 * @example
 *   ;```ts
 *   const formatter = getDisjunctionFormatter()
 *   formatter.format(['red', 'blue', 'green'])
 *   // Returns: "red, blue, or green"
 *   ```
 *
 * @returns Cached Intl.ListFormat instance configured for disjunction
 *   formatting.
 */
export function getDisjunctionFormatter() {
  if (disjunctionFormatter === undefined) {
    // Intl.ListFormat initialization
    /* c8 ignore start - lazy singleton init runs once; not worth a dedicated test */
    disjunctionFormatter = new IntlListFormat('en', {
      style: 'long',
      // "or" lists.
      type: 'disjunction',
    })
    /* c8 ignore stop */
  }
  return disjunctionFormatter
}
