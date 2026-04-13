/**
 * NODE_ENV environment variable getter.
 * Indicates the Node.js environment mode (production, development, test).
 */

import { getEnvValue } from './rewire'

/**
 * Returns the value of the NODE_ENV environment variable.
 *
 * @returns The Node.js environment mode, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getNodeEnv } from '@socketsecurity/lib/env/node-env'
 *
 * const env = getNodeEnv()
 * // e.g. 'production', 'development', 'test', or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getNodeEnv(): string | undefined {
  return getEnvValue('NODE_ENV')
}
