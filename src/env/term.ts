/**
 * TERM environment variable getter.
 * Terminal type identifier.
 */

import { getEnvValue } from '#env/rewire'

/*@__NO_SIDE_EFFECTS__*/
export function getTerm(): string | undefined {
  return getEnvValue('TERM')
}
