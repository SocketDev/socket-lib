/**
 * @fileoverview DEBUG environment variable getter.
 * Exports `getDebug()`, which returns the raw `DEBUG` filter string used by
 * the `debug` package (or `undefined` when unset).
 */

import { getEnvValue } from './rewire'

/**
 * Returns the value of the DEBUG environment variable.
 *
 * @returns The debug filter string, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getDebug } from '@socketsecurity/lib/env/debug'
 *
 * const debug = getDebug()
 * // e.g. 'socket:*' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getDebug(): string | undefined {
  return getEnvValue('DEBUG')
}
