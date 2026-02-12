/**
 * CI environment variable getter.
 * Determines if code is running in a Continuous Integration environment.
 */

import { isInEnv } from './rewire'

/*@__NO_SIDE_EFFECTS__*/
export function getCI(): boolean {
  return isInEnv('CI')
}
