/**
 * PRE_COMMIT environment variable getter.
 * Whether running in a pre-commit hook context.
 */

import { envAsBoolean } from './helpers'
import { getEnvValue } from './rewire'

/*@__NO_SIDE_EFFECTS__*/
export function getPreCommit(): boolean {
  return envAsBoolean(getEnvValue('PRE_COMMIT'))
}
