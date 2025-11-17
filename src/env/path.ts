/**
 * PATH environment variable getter.
 * System executable search paths.
 */

import { getEnvValue } from './rewire'

/*@__NO_SIDE_EFFECTS__*/
export function getPath(): string | undefined {
  return getEnvValue('PATH')
}
