/**
 * @fileoverview `envAsNumber` — coerce an env-var-shaped value into
 * a number. `mode: 'int'` uses `parseInt(_, 10)`; `mode: 'float'`
 * uses `Number()`. Non-finite results round-trip through
 * `defaultValue` unless `allowInfinity: true` is set.
 */

import type { EnvAsNumberOptions } from './types'

// IMPORTANT: Do not use destructuring here - use direct assignment instead.
// tsgo has a bug that incorrectly transpiles destructured exports, resulting in
// `exports.SomeName = void 0;` which causes runtime errors.
// See: https://github.com/SocketDev/socket-packageurl-js/issues/3
const NumberCtor = Number
const NumberIsFinite = Number.isFinite
const NumberIsNaN = Number.isNaN
const NumberParseInt = Number.parseInt

/**
 * Convert an environment variable value to a number.
 *
 * Back-compat overload: passing a bare number as the second argument is
 * equivalent to `{ defaultValue: N }`.
 *
 * @param value - The value to convert
 * @param defaultValueOrOptions - Default (number) or options object
 * @returns The parsed number, or the default value if parsing fails
 *
 * @example
 * ```typescript
 * import { envAsNumber } from '@socketsecurity/lib/env/number'
 *
 * envAsNumber('3000')              // 3000 (int mode)
 * envAsNumber('3.14', { mode: 'float' }) // 3.14
 * envAsNumber('abc')               // 0
 * envAsNumber(undefined, 42)       // 42 (legacy positional default)
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function envAsNumber(
  value: unknown,
  defaultValueOrOptions: number | EnvAsNumberOptions | undefined = 0,
): number {
  // `?? {}` arm fires only when caller passes undefined explicitly.
  /* c8 ignore next 4 */
  const opts: EnvAsNumberOptions =
    typeof defaultValueOrOptions === 'number'
      ? { defaultValue: defaultValueOrOptions }
      : (defaultValueOrOptions ?? {})
  const { allowInfinity = false, defaultValue = 0, mode = 'int' } = opts

  // Fast-paths for the strict `string | undefined` shape (helpers semantics).
  if (value === undefined || value === null) {
    return defaultValue
  }
  if (typeof value === 'string') {
    if (!value) {
      return defaultValue
    }
    // float vs int mode tested separately; non-finite + allowInfinity
    // arms exercised only when caller opts into infinity handling.
    /* c8 ignore start */
    const num = mode === 'float' ? NumberCtor(value) : NumberParseInt(value, 10)
    if (NumberIsNaN(num)) {
      return defaultValue
    }
    if (!NumberIsFinite(num)) {
      return allowInfinity ? num : defaultValue
    }
    return num || 0
    /* c8 ignore stop */
  }

  // Broad (unknown) path — coerce via String() then parse. Defensive
  // path; tests pass strings.
  /* c8 ignore start */
  const numOrNaN =
    mode === 'float'
      ? NumberCtor(String(value))
      : NumberParseInt(String(value), 10)
  const numMayBeNegZero = NumberIsFinite(numOrNaN)
    ? numOrNaN
    : NumberCtor(defaultValue)
  return numMayBeNegZero || 0
  /* c8 ignore stop */
}
