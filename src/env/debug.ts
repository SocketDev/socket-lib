/**
 * DEBUG environment variable getter.
 * Controls debug output for the debug package.
 */

import { getEnvValue } from './rewire'

/**
 * Returns the value of the DEBUG environment variable.
 *
 * @returns The debug filter string, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getDebug } from '@socketsecurity/lib/env/debug'
 *
 * const debug = getDebug()
 * // e.g. 'socket:*' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getDebug(): string | undefined {
  return getEnvValue('DEBUG')
}
