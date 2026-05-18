/**
 * @file `signals()` — list the signals this process is watching. Before
 *   `load()` runs, returns the lazy-initialised default list; after `load()`
 *   runs, returns the filtered subset that was actually registered
 *   successfully.
 */

import { getSignals } from './_internal'

/**
 * Get the list of signals that are currently being monitored.
 *
 * @example
 *   ;```typescript
 *   const sigs = signals()
 *   console.log(sigs) // ['SIGABRT', 'SIGALRM', 'SIGHUP', ...]
 *   ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function signals(): string[] {
  return getSignals()
}
