/**
 * @file PRE_COMMIT environment variable getter. Exports `getPreCommit()`, a
 *   boolean coercion of `PRE_COMMIT` used to detect when code is running inside
 *   a pre-commit hook.
 */

import { envAsBoolean } from './boolean'
import { getEnvValue } from './rewire'

/**
 * Returns whether the PRE_COMMIT environment variable is set to a truthy value.
 *
 * @example
 *   ;```typescript
 *   import { getPreCommit } from '@socketsecurity/lib/env/pre-commit'
 *
 *   if (getPreCommit()) {
 *     console.log('Running in pre-commit hook')
 *   }
 *   ```
 *
 * @returns `true` if running in a pre-commit hook, `false` otherwise
 */
export function getPreCommit(): boolean {
  return envAsBoolean(getEnvValue('PRE_COMMIT'))
}
