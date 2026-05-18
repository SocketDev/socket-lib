/**
 * @file `withTmp` — run a callback with a freshly-created temp directory under
 *   the cacache root. Wraps cacache's `tmp.withTmp` with a corrected type
 *   signature (the DefinitelyTyped definition incorrectly declares `void` even
 *   though the function forwards the callback's return value).
 */

import { getSocketCacacheDir } from '../paths/socket'

import { getCacache } from './_internal'

/**
 * Execute a callback with a temporary directory for cache operations.
 *
 * @example
 *   ;```typescript
 *   const result = await withTmp(async tmpDir => {
 *     // Use tmpDir for temporary cache work
 *     return 'done'
 *   })
 *   ```
 */
export async function withTmp<T>(
  callback: (tmpDirPath: string) => Promise<T>,
): Promise<T> {
  const cacache = getCacache()
  // The DefinitelyTyped types for cacache.tmp.withTmp are incorrect.
  // It actually returns the callback's return value, not void.
  /* c8 ignore start - External cacache call */
  return (await cacache.tmp.withTmp(
    getSocketCacacheDir(),
    {},
    callback as any,
  )) as T
  /* c8 ignore stop */
}
