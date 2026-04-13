/**
 * SHELL environment variable getter.
 * Unix/macOS default shell path.
 */

import { getEnvValue } from './rewire'

/**
 * Returns the value of the SHELL environment variable.
 *
 * @returns The user's default shell path, or `undefined` if not set
 *
 * @example
 * ```typescript
 * import { getShell } from '@socketsecurity/lib/env/shell'
 *
 * const shell = getShell()
 * // e.g. '/bin/zsh' or '/bin/bash'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getShell(): string | undefined {
  return getEnvValue('SHELL')
}
