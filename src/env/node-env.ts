/**
 * NODE_ENV environment variable getter.
 * Indicates the Node.js environment mode (production, development, test).
 */

import { getEnvValue } from './rewire'

/*@__NO_SIDE_EFFECTS__*/
export function getNodeEnv(): string | undefined {
  return getEnvValue('NODE_ENV')
}
