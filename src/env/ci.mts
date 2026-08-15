/**
 * @file CI environment predicate. Exports `isCI()`, which returns whether the
 *   `CI` environment variable is present (using the rewire helper so tests can
 *   override without touching `process.env`). Deliberately not memoized: the
 *   rewire overrides must stay live between calls.
 */

import { isInEnv } from './rewire.mjs'

/**
 * Returns whether the CI environment variable is set.
 *
 * @example
 *   ;```typescript
 *   import { isCI } from '@socketsecurity/lib/env/ci'
 *
 *   if (isCI()) {
 *     console.log('Running in CI')
 *   }
 *   ```
 *
 * @returns `true` if running in a CI environment, `false` otherwise
 */
export function isCI(): boolean {
  return isInEnv('CI')
}
