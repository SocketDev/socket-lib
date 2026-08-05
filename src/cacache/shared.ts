/**
 * @file Accessor for the vendored `cacache` module. Centralised so other
 *   `cacache/*` leaves stay decoupled from the import path — if the vendoring
 *   moves, only this leaf updates.
 *   Snapshot safety: the vendored `cacache` resolves through the npm-pack
 *   bundle, whose module-eval constructs a live native `[Foreign]` handle.
 *   Importing it at module load pins that handle into the heap and aborts
 *   `node --build-snapshot`, so the require is deferred to first use and
 *   memoized.
 */

import type cacache from '../external/cacache'

let cached: typeof cacache | undefined

/**
 * Get the cacache module for cache operations. Required lazily on first call so
 * importing a `cacache/*` leaf does not pull in the native-handle-bearing
 * npm-pack bundle.
 *
 * @example
 *   ;```typescript
 *   const cacache = getCacache()
 *   const entries = await cacache.ls(cacheDir)
 *   ```
 */
export function getCacache(): typeof cacache {
  if (cached === undefined) {
    cached = require('../external/cacache') as typeof cacache
  }
  return cached
}
