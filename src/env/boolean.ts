/**
 * @file `envAsBoolean` — coerce an env-var-shaped value into a boolean. Accepts
 *   a back-compat positional `defaultValue` or an options bag (with `trim`).
 *   Truthy vocabulary is `'1'` / `'true'` / `'yes'` case-insensitively after
 *   optional trim.
 */

import type { EnvAsBooleanOptions } from './types'

/**
 * Convert an environment variable value to a boolean.
 *
 * Back-compat overload: passing a bare boolean as the second argument is
 * equivalent to `{ defaultValue: B }`.
 *
 * @example
 *   ;```typescript
 *   import { envAsBoolean } from '@socketsecurity/lib/env/boolean'
 *
 *   envAsBoolean('true') // true
 *   envAsBoolean('1') // true
 *   envAsBoolean('yes') // true
 *   envAsBoolean('  true  ') // true (trimmed)
 *   envAsBoolean('  true  ', { trim: false }) // false (strict)
 *   envAsBoolean(undefined) // false
 *   envAsBoolean(undefined, true) // true (legacy positional default)
 *   ```
 *
 * @param value - The value to convert.
 * @param defaultValueOrOptions - Default (boolean) or options object.
 *
 * @returns `true` if value is '1', 'true', or 'yes' (case-insensitive), `false`
 *   otherwise.
 */
/*@__NO_SIDE_EFFECTS__*/
export function envAsBoolean(
  value: unknown,
  defaultValueOrOptions: boolean | EnvAsBooleanOptions | undefined = false,
): boolean {
  // `?? {}` arm fires only when caller passes undefined explicitly.
  /* c8 ignore next 4 */
  const opts: EnvAsBooleanOptions =
    typeof defaultValueOrOptions === 'boolean'
      ? { defaultValue: defaultValueOrOptions }
      : (defaultValueOrOptions ?? {})
  const { defaultValue = false, trim = true } = opts
  if (typeof value === 'string') {
    const candidate = trim ? value.trim() : value
    if (!candidate) {
      return !!defaultValue
    }
    const lower = candidate.toLowerCase()
    return lower === '1' || lower === 'true' || lower === 'yes'
  }
  if (value === null || value === undefined) {
    return !!defaultValue
  }
  return !!value
}
