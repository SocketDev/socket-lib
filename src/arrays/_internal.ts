/**
 * @file Private internals for `arrays/*` modules — cached `Intl.ListFormat`
 *   instances for conjunction (and) and disjunction (or) joins. Constructed
 *   lazily because `new Intl.ListFormat(...)` is a measurable startup cost.
 */

let _conjunctionFormatter: Intl.ListFormat | undefined
let _disjunctionFormatter: Intl.ListFormat | undefined

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
/*@__NO_SIDE_EFFECTS__*/
export function getConjunctionFormatter() {
  if (_conjunctionFormatter === undefined) {
    // Intl.ListFormat initialization
    /* c8 ignore start */
    _conjunctionFormatter = new Intl.ListFormat('en', {
      style: 'long',
      // "and" lists.
      type: 'conjunction',
    })
    /* c8 ignore stop */
  }
  return _conjunctionFormatter
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
/*@__NO_SIDE_EFFECTS__*/
export function getDisjunctionFormatter() {
  if (_disjunctionFormatter === undefined) {
    // Intl.ListFormat initialization
    /* c8 ignore start */
    _disjunctionFormatter = new Intl.ListFormat('en', {
      style: 'long',
      // "or" lists.
      type: 'disjunction',
    })
    /* c8 ignore stop */
  }
  return _disjunctionFormatter
}
