/**
 * @fileoverview Environment variable type conversion helpers.
 *
 * Thin wrappers over the unified implementations in `@socketsecurity/lib/env`
 * that preserve the narrower `string | undefined` input signature and the
 * original strict-no-trim / float / whitespace-preserving defaults. Prefer
 * the root `env` module for new code — it supports both modes via options.
 */

import {
  envAsBoolean as envAsBooleanRoot,
  envAsNumber as envAsNumberRoot,
  envAsString as envAsStringRoot,
} from '../env'

/**
 * Convert an environment variable string to a boolean.
 * Strict matching — does NOT trim whitespace (' true ' is false).
 *
 * @param value - The environment variable value to convert
 * @returns `true` if value is exactly 'true', '1', or 'yes' (case-insensitive), `false` otherwise
 *
 * @example
 * ```typescript
 * import { envAsBoolean } from '@socketsecurity/lib/env/helpers'
 *
 * envAsBoolean('true')      // true
 * envAsBoolean('1')         // true
 * envAsBoolean('yes')       // true
 * envAsBoolean(' true ')    // false (no trim)
 * envAsBoolean(undefined)   // false
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function envAsBoolean(value: string | undefined): boolean {
  return envAsBooleanRoot(value, { trim: false })
}

/**
 * Convert an environment variable string to a number.
 * Uses `Number()` (decimals, hex, octal, binary, Infinity preserved); returns
 * 0 only for undefined/empty/NaN. For int-only parsing use `envAsNumber` in
 * `@socketsecurity/lib/env` with default `mode: 'int'`.
 *
 * @param value - The environment variable value to convert
 * @returns The parsed number, or `0` if the value is undefined or NaN
 *
 * @example
 * ```typescript
 * import { envAsNumber } from '@socketsecurity/lib/env/helpers'
 *
 * envAsNumber('3000')       // 3000
 * envAsNumber('3.14')       // 3.14
 * envAsNumber('Infinity')   // Infinity
 * envAsNumber(undefined)    // 0
 * envAsNumber('abc')        // 0
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function envAsNumber(value: string | undefined): number {
  return envAsNumberRoot(value, { mode: 'float', allowInfinity: true })
}

/**
 * Convert an environment variable value to a string, preserving whitespace.
 * For trimmed-string behavior use `envAsString` in `@socketsecurity/lib/env`
 * (default `trim: true`); this helper passes `trim: false`.
 *
 * @param value - The environment variable value to convert
 * @returns The string value, or an empty string if undefined
 *
 * @example
 * ```typescript
 * import { envAsString } from '@socketsecurity/lib/env/helpers'
 *
 * envAsString('hello')    // 'hello'
 * envAsString('  x  ')    // '  x  ' (whitespace preserved)
 * envAsString(undefined)  // ''
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function envAsString(value: string | undefined): string {
  return envAsStringRoot(value, { trim: false })
}
