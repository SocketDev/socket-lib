/**
 * PATH environment variable getter.
 * System executable search paths.
 */

import { getEnvValue } from './rewire'

/**
 * Returns the value of the PATH environment variable.
 *
 * @returns The system executable search paths, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getPath } from '@socketsecurity/lib/env/path'
 *
 * const path = getPath()
 * // e.g. '/usr/local/bin:/usr/bin:/bin' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getPath(): string | undefined {
  return getEnvValue('PATH')
}
