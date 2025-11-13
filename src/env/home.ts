/**
 * HOME environment variable getter.
 * Points to the user's home directory.
 */

import { getEnvValue } from '#env/rewire'

/*@__NO_SIDE_EFFECTS__*/
export function getHome(): string | undefined {
  return getEnvValue('HOME')
}
