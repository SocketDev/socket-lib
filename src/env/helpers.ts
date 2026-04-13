/**
 * @fileoverview Environment variable type conversion helpers.
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
 * Convert an environment variable value to a string.
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
