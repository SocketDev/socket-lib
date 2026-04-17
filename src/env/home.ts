/**
 * @fileoverview HOME environment variable getter with Windows fallback.
 * Returns the user's home directory. On Windows, HOME is typically unset —
 * fall back to USERPROFILE before giving up, matching the resolution order
 * used by npm, git, and Node's os.homedir().
 */

import { getEnvValue } from './rewire'

/**
 * Returns the user's home directory path.
 *
 * Resolution order:
 *   1. `$HOME` (POSIX, and sometimes set on Windows by shells like Git Bash)
 *   2. `$USERPROFILE` (Windows default, e.g. `C:\Users\alice`)
 *
 * Returns `undefined` only when neither is set, which on modern systems is
 * exceedingly rare outside of sandboxed or minimal-env test harnesses.
 *
 * @returns The user's home directory path, or `undefined` if not resolvable
 *
 * @example
 * ```typescript
 * import { getHome } from '@socketsecurity/lib/env/home'
 *
 * const home = getHome()
 * // POSIX: '/Users/alice'
 * // Windows: 'C:\\Users\\alice'
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function getHome(): string | undefined {
  return getEnvValue('HOME') ?? getEnvValue('USERPROFILE')
}
