/**
 * CI environment variable getter.
 * Determines if code is running in a Continuous Integration environment.
 */

import { isInEnv } from './rewire'

/**
 * Returns whether the CI environment variable is set.
 *
 * @returns `true` if running in a CI environment, `false` otherwise
 *
 * @example
 * ```typescript
 * import { getCI } from '@socketsecurity/lib/env/ci'
 *
 * if (getCI()) {
 *   console.log('Running in CI')
 * }
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getCI(): boolean {
  return isInEnv('CI')
}
