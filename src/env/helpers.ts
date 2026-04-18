/**
 * @fileoverview Environment variable type conversion helpers.
 *
 * NOTE: These helpers accept `string | undefined` and are designed for reading
 * process.env values directly. They differ from the `envAsBoolean`/`envAsNumber`/
 * `envAsString` exports in `@socketsecurity/lib/env`:
 *
 * - `envAsBoolean` here accepts `'yes'` as a truthy value (in addition to `'1'`
 *   / `'true'`). The root export also accepts `'yes'` (unified) but takes
 *   `unknown` and supports a configurable default.
 * - `envAsNumber` here uses `Number()` which preserves decimals; the root
 *   export uses `parseInt(_, 10)` and returns integers only.
 * - `envAsString` here preserves whitespace; the root export trims.
 *
 * Internal env/*.ts modules import from this file for the raw env-string
 * semantics; external callers preferring integer/trimmed behavior should
 * import from `@socketsecurity/lib/env`.
 */

/**
 * Convert an environment variable string to a boolean.
 *
 * @param value - The environment variable value to convert
 * @returns `true` if value is 'true', '1', or 'yes' (case-insensitive), `false` otherwise
 *
 * @example
 * ```typescript
 * import { envAsBoolean } from '@socketsecurity/lib/env/helpers'
 *
 * envAsBoolean('true')      // true
 * envAsBoolean('1')         // true
 * envAsBoolean('yes')       // true
 * envAsBoolean(undefined)   // false
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function envAsBoolean(value: string | undefined): boolean {
  if (!value) {
    return false
  }
  const lower = value.toLowerCase()
  return lower === 'true' || lower === '1' || lower === 'yes'
}

/**
 * Convert an environment variable string to a number.
 * Uses `Number()` so decimal values are preserved; returns 0 for undefined or
 * NaN. For integer-only parsing see `envAsNumber` in `@socketsecurity/lib/env`.
 *
 * @param value - The environment variable value to convert
 * @returns The parsed number, or `0` if the value is undefined or not a valid number
 *
 * @example
 * ```typescript
 * import { envAsNumber } from '@socketsecurity/lib/env/helpers'
 *
 * envAsNumber('3000')     // 3000
 * envAsNumber(undefined)  // 0
 * envAsNumber('abc')      // 0
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function envAsNumber(value: string | undefined): number {
  if (!value) {
    return 0
  }
  const num = Number(value)
  return Number.isNaN(num) ? 0 : num
}

/**
 * Convert an environment variable value to a string, preserving whitespace.
 * For trimmed-string behavior, see `envAsString` in `@socketsecurity/lib/env`.
 *
 * @param value - The environment variable value to convert
 * @returns The string value, or an empty string if undefined
 *
 * @example
 * ```typescript
 * import { envAsString } from '@socketsecurity/lib/env/helpers'
 *
 * envAsString('hello')    // 'hello'
 * envAsString(undefined)  // ''
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function envAsString(value: string | undefined): string {
  return value || ''
}
