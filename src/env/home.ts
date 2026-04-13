/**
 * HOME environment variable getter.
 * Points to the user's home directory.
 */

import { getEnvValue } from './rewire'

/**
 * Returns the value of the HOME environment variable.
 *
 * @returns The user's home directory path, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getHome } from '@socketsecurity/lib/env/home'
 *
 * const home = getHome()
 * // e.g. '/tmp/user' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getHome(): string | undefined {
  return getEnvValue('HOME')
}
