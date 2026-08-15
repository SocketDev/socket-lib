/**
 * @file `envAsBoolean` — coerce an env-var-shaped value into a boolean via an
 *   options bag (`defaultValue`, `trim`). Truthy vocabulary is `'1'` /
 *   `'true'` / `'yes'` case-insensitively after optional trim.
 */

import type { EnvAsBooleanOptions } from './types.mjs'

/**
 * Convert an environment variable value to a boolean.
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
 *   envAsBoolean(undefined, { defaultValue: true }) // true
 *   ```
 *
 * @param value - The value to convert.
 * @param options - Options bag: `defaultValue`, `trim`.
 *
 * @returns `true` if value is '1', 'true', or 'yes' (case-insensitive), `false`
 *   otherwise.
 */
export function envAsBoolean(
  value: unknown,
  options?: EnvAsBooleanOptions | undefined,
): boolean {
  const { defaultValue = false, trim = true } = {
    __proto__: null,
    ...options,
  } as EnvAsBooleanOptions
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
