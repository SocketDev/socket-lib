/**
 * @file Accessor for the vendored `cacache` module. Centralised so other
 *   `cacache/*` leaves stay decoupled from the import path — if the vendoring
 *   moves, only this leaf updates.
 */

import cacache from '../external/cacache'

/**
 * Get the cacache module for cache operations.
 *
 * @example
 *   ;```typescript
 *   const cacache = getCacache()
 *   const entries = await cacache.ls(cacheDir)
 *   ```
 */
export function getCacache() {
  // cacache is imported at the top
  return cacache
}
