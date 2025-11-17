/**
 * NODE_AUTH_TOKEN environment variable getter.
 * Authentication token for Node.js package registry access.
 */

import { getEnvValue } from './rewire'

/*@__NO_SIDE_EFFECTS__*/
export function getNodeAuthToken(): string | undefined {
  return getEnvValue('NODE_AUTH_TOKEN')
}
