/**
 * CI environment variable getter.
 * Determines if code is running in a Continuous Integration environment.
 */

import { envAsBoolean } from '#env/helpers'
import { getEnvValue } from '#env/rewire'

/*@__NO_SIDE_EFFECTS__*/
export function getCI(): boolean {
  return envAsBoolean(getEnvValue('CI'))
}
