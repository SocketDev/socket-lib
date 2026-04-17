/**
 * @fileoverview NODE_ENV environment variable getter.
 * Exports `getNodeEnv()`, returning the raw `NODE_ENV` value (typically
 * 'production', 'development', or 'test') or `undefined` when unset.
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
