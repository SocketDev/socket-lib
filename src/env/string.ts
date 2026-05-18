/**
 * @file `envAsString` — coerce an env-var-shaped value into a string. Defaults
 *   to trimming whitespace; `trim: false` preserves the value as-is. Positional
 *   second argument is back-compat for the legacy `defaultValue` form.
 */

import { ArrayIsArray } from '../primordials/array'

import type { EnvAsStringOptions } from './types'

// IMPORTANT: Do not use destructuring here - use direct assignment instead.
// tsgo has a bug that incorrectly transpiles destructured exports, resulting in
// `exports.SomeName = void 0;` which causes runtime errors.
// See: https://github.com/SocketDev/socket-packageurl-js/issues/3
const StringCtor = String

/**
 * Convert an environment variable value to a string.
 *
 * Back-compat overload: passing a bare string as the second argument is
 * equivalent to `{ defaultValue: S }`.
 *
 * @example
 *   ;```typescript
 *   import { envAsString } from '@socketsecurity/lib/env/string'
 *
 *   envAsString('  hello  ') // 'hello' (trimmed)
 *   envAsString('  hello  ', { trim: false }) // '  hello  '
 *   envAsString(undefined) // ''
 *   envAsString(null, 'n/a') // 'n/a' (legacy positional)
 *   ```
 *
 * @param value - The value to convert.
 * @param defaultValueOrOptions - Default (string) or options object.
 *
 * @returns The string value, or the default value
 */
/*@__NO_SIDE_EFFECTS__*/
export function envAsString(
  value: unknown,
  defaultValueOrOptions: string | EnvAsStringOptions | undefined = '',
): string {
  // Accept bare string OR any non-options value as positional default for
  // legacy compat (`envAsString(null, 123)` coerces to '123'). Options form
  // is detected by plain-object shape with known keys.
  const isOptionsObject =
    typeof defaultValueOrOptions === 'object' &&
    defaultValueOrOptions !== null &&
    !ArrayIsArray(defaultValueOrOptions) &&
    ('defaultValue' in defaultValueOrOptions || 'trim' in defaultValueOrOptions)
  // Defensive default-value coercion arms; tests pass strings or
  // options objects.
  /* c8 ignore start */
  const opts: EnvAsStringOptions = isOptionsObject
    ? (defaultValueOrOptions as EnvAsStringOptions)
    : {
        defaultValue:
          defaultValueOrOptions === undefined
            ? ''
            : typeof defaultValueOrOptions === 'string'
              ? defaultValueOrOptions
              : StringCtor(defaultValueOrOptions),
      }
  /* c8 ignore stop */
  const { defaultValue = '', trim = true } = opts

  if (value === undefined || value === null) {
    return defaultValue === '' || !trim
      ? defaultValue
      : StringCtor(defaultValue).trim()
  }
  if (typeof value === 'string') {
    return trim ? value.trim() : value
  }
  // Non-string coercion path; tests pass strings.
  /* c8 ignore next 2 */
  const str = StringCtor(value)
  return trim ? str.trim() : str
}
