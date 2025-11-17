/**
 * SHELL environment variable getter.
 * Unix/macOS default shell path.
 */

import { getEnvValue } from './rewire'

/*@__NO_SIDE_EFFECTS__*/
export function getShell(): string | undefined {
  return getEnvValue('SHELL')
}
