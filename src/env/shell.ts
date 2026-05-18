/**
 * @file SHELL environment variable getter. Exports `getShell()`, returning the
 *   Unix/macOS `SHELL` path (for example `/bin/zsh`) or `undefined` when the
 *   variable is unset.
 */

import { getEnvValue } from './rewire'

/**
 * Returns the value of the SHELL environment variable.
 *
 * @example
 *   ;```typescript
 *   import { getShell } from '@socketsecurity/lib/env/shell'
 *
 *   const shell = getShell()
 *   // e.g. '/bin/zsh' or '/bin/bash'
 *   ```
 *
 * @returns The user's default shell path, or `undefined` if not set
 */
/*@__NO_SIDE_EFFECTS__*/
export function getShell(): string | undefined {
  return getEnvValue('SHELL')
}
