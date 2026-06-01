/**
 * @file DEBUG environment variable getter. Exports `getDebug()`, which returns
 *   the raw `DEBUG` filter string used by the `debug` package (or `undefined`
 *   when unset).
 */

import { getEnvValue } from './rewire'

/**
 * Returns the value of the DEBUG environment variable.
 *
 * @example
 *   ;```typescript
 *   import { getDebug } from '@socketsecurity/lib/env/debug'
 *
 *   const debug = getDebug()
 *   // e.g. 'socket:*' or undefined
 *   ```
 *
 * @returns The debug filter string, or `undefined` if not set
 */
export function getDebug(): string | undefined {
  return getEnvValue('DEBUG')
}
