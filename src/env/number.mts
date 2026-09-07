/**
 * @file `envAsNumber` — coerce an env-var-shaped value into a number. `mode:
 *   'int'` uses `parseInt(_, 10)`; `mode: 'float'` uses `Number()`. Non-finite
 *   results round-trip through `defaultValue` unless `allowInfinity: true` is
 *   set.
 */

import {
  NumberCtor,
  NumberIsFinite,
  NumberIsNaN,
  NumberParseInt,
} from '../primordials/number.mjs'

import type { EnvAsNumberOptions } from './types.mjs'

/**
 * Convert an environment variable value to a number.
 *
 * @example
 *   ;```typescript
 *   import { envAsNumber } from '@socketsecurity/lib/env/number'
 *
 *   envAsNumber('3000') // 3000 (int mode)
 *   envAsNumber('3.14', { mode: 'float' }) // 3.14
 *   envAsNumber('abc') // 0
 *   envAsNumber(undefined, { defaultValue: 42 }) // 42
 *   ```
 *
 * @param value - The value to convert.
 * @param options - Options bag: `defaultValue`, `mode`, `allowInfinity`.
 *
 * @returns The parsed number, or the default value if parsing fails
 */
export function envAsNumber(
  value: unknown,
  options?: EnvAsNumberOptions | undefined,
): number {
  const {
    allowInfinity = false,
    defaultValue = 0,
    mode = 'int',
  } = {
    __proto__: null,
    ...options,
  } as EnvAsNumberOptions

  if (value === undefined || value === null) {
    return defaultValue
  }
  const num =
    mode === 'float'
      ? NumberCtor(String(value))
      : NumberParseInt(String(value), 10)
  if (typeof value === 'string') {
    if (!value || NumberIsNaN(num)) {
      return defaultValue
    }
    if (!NumberIsFinite(num)) {
      return allowInfinity ? num : defaultValue
    }
    return num || 0
  }

  const numMayBeNegZero = NumberIsFinite(num) ? num : NumberCtor(defaultValue)
  return numMayBeNegZero || 0
}
