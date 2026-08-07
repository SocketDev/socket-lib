/**
 * @file `envAsString` — coerce an env-var-shaped value into a string via an
 *   options bag (`defaultValue`, `trim`). Defaults to trimming whitespace;
 *   `trim: false` preserves the value as-is.
 */

import { StringCtor } from '../primordials/string'

import type { EnvAsStringOptions } from './types'

/**
 * Convert an environment variable value to a string.
 *
 * @example
 *   ;```typescript
 *   import { envAsString } from '@socketsecurity/lib/env/string'
 *
 *   envAsString('  hello  ') // 'hello' (trimmed)
 *   envAsString('  hello  ', { trim: false }) // '  hello  '
 *   envAsString(undefined) // ''
 *   envAsString(null, { defaultValue: 'n/a' }) // 'n/a'
 *   ```
 *
 * @param value - The value to convert.
 * @param options - Options bag: `defaultValue`, `trim`.
 *
 * @returns The string value, or the default value
 */
export function envAsString(
  value: unknown,
  options?: EnvAsStringOptions | undefined,
): string {
  const { defaultValue = '', trim = true } = {
    __proto__: null,
    ...options,
  } as EnvAsStringOptions

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
