/**
 * @file Grammatical list joiners via `Intl.ListFormat` — Oxford-comma aware and
 *   locale-correct. `joinList` (generalized), `joinAnd` ("a, b, and c"),
 *   `joinOr` ("a, b, or c").
 */

import { getConjunctionFormatter, getDisjunctionFormatter } from './_internal'

export type JoinListOptions =
  | { conjunction: 'and' | 'or'; list?: undefined }
  | { list: true; conjunction?: undefined }
  | Record<string, never>

/**
 * Join array elements with proper "and" conjunction formatting.
 *
 * Formats an array of strings into a grammatically correct list using "and" as
 * the conjunction. Uses `Intl.ListFormat` for proper English formatting with
 * Oxford comma support. Delegates to `joinList`.
 *
 * @example
 *   ```ts
 *   // Two items
 *   joinAnd(['apples', 'oranges'])
 *   // Returns: "apples and oranges"
 *
 *   // Three or more items (Oxford comma)
 *   joinAnd(['apples', 'oranges', 'bananas'])
 *   // Returns: "apples, oranges, and bananas"
 *
 *   // Single item
 *   joinAnd(['apples'])
 *   // Returns: "apples"
 *
 *   // Empty array
 *   joinAnd([])
 *   // Returns: ""
 *
 *   // Usage in messages
 *   const items = ['React', 'Vue', 'Angular']
 *   console.log(`You can choose ${joinAnd(items)}`)
 *   // Outputs: "You can choose React, Vue, and Angular"
 *   ```
 *
 * @param arr - Array of strings to join (can be readonly)
 *
 * @returns Formatted string with proper "and" conjunction
 */
export function joinAnd(arr: readonly string[]): string {
  return joinList(arr, { conjunction: 'and' })
}

/**
 * Generalized list joiner covering bare join, comma-list, and
 * conjunction/disjunction via `Intl.ListFormat`.
 *
 * - No options / empty object: bare concatenation (`items.map(String).join('')`)
 * - `{ list: true }`: comma-separated (`'a, b, c'`), no conjunction
 * - `{ conjunction: 'and' }`: Oxford-comma "and" list (`'a, b, and c'`)
 * - `{ conjunction: 'or' }`: Oxford-comma "or" list (`'a, b, or c'`)
 *
 * Each item is coerced via `String()` before formatting.
 *
 * @param items - Items to join (can be readonly, any type)
 * @param options - Formatting options (optional)
 *
 * @returns Formatted string
 */
export function joinList(
  items: readonly unknown[],
  options?: JoinListOptions,
): string {
  if (
    options &&
    'conjunction' in options &&
    options.conjunction !== undefined
  ) {
    const strs = items.map(String)
    return options.conjunction === 'and'
      ? getConjunctionFormatter().format(strs)
      : getDisjunctionFormatter().format(strs)
  }
  if (options && 'list' in options && options.list === true) {
    return items.map(String).join(', ')
  }
  return items.map(String).join('')
}

/**
 * Join array elements with proper "or" disjunction formatting.
 *
 * Formats an array of strings into a grammatically correct list using "or" as
 * the disjunction. Uses `Intl.ListFormat` for proper English formatting with
 * Oxford comma support. Delegates to `joinList`.
 *
 * @example
 *   ```ts
 *   // Two items
 *   joinOr(['yes', 'no'])
 *   // Returns: "yes or no"
 *
 *   // Three or more items (Oxford comma)
 *   joinOr(['red', 'green', 'blue'])
 *   // Returns: "red, green, or blue"
 *
 *   // Single item
 *   joinOr(['maybe'])
 *   // Returns: "maybe"
 *
 *   // Empty array
 *   joinOr([])
 *   // Returns: ""
 *
 *   // Usage in prompts
 *   const options = ['npm', 'yarn', 'pnpm']
 *   console.log(`Choose a package manager: ${joinOr(options)}`)
 *   // Outputs: "Choose a package manager: npm, yarn, or pnpm"
 *   ```
 *
 * @param arr - Array of strings to join (can be readonly)
 *
 * @returns Formatted string with proper "or" disjunction
 */
export function joinOr(arr: readonly string[]): string {
  return joinList(arr, { conjunction: 'or' })
}
