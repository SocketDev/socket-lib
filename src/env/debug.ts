/**
 * DEBUG environment variable getter.
 * Controls debug output for the debug package.
 */

import { getEnvValue } from '#env/rewire'

/*@__NO_SIDE_EFFECTS__*/
export function getDebug(): string | undefined {
  return getEnvValue('DEBUG')
}
