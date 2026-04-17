/**
 * @fileoverview NODE_AUTH_TOKEN environment variable getter.
 * Exports `getNodeAuthToken()`, returning the value of `NODE_AUTH_TOKEN`
 * used to authenticate against Node.js package registries.
 */

import { getEnvValue } from './rewire'

/**
 * Returns the value of the NODE_AUTH_TOKEN environment variable.
 *
 * @returns The Node.js registry auth token, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getNodeAuthToken } from '@socketsecurity/lib/env/node-auth-token'
 *
 * const token = getNodeAuthToken()
 * // e.g. 'npm_abc123...' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getNodeAuthToken(): string | undefined {
  return getEnvValue('NODE_AUTH_TOKEN')
}
