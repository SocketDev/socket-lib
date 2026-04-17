/**
 * @fileoverview TERM environment variable getter.
 * Exports `getTerm()`, returning the `TERM` terminal type identifier (for
 * example `xterm-256color`) or `undefined` when unset.
 */

import { getEnvValue } from './rewire'

/**
 * Returns the value of the TERM environment variable.
 *
 * @returns The terminal type identifier, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getTerm } from '@socketsecurity/lib/env/term'
 *
 * const term = getTerm()
 * // e.g. 'xterm-256color' or undefined
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getTerm(): string | undefined {
  return getEnvValue('TERM')
}
