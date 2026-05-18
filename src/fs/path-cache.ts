/**
 * @file Cache-invalidation entry point for the allowed-directories list used by
 *   `safeDelete` / `safeDeleteSync`. Loading this module registers
 *   `invalidatePathCache` with `paths/rewire.ts` so test-time path overrides
 *   flush the cache; the registration is the module's only side effect, so
 *   callers that just need to flush the cache imperatively can call
 *   `invalidatePathCache()` directly without that side effect repeating.
 */

import { registerCacheInvalidation } from '../paths/rewire'

import { clearAllowedDirectories } from './_internal'

/**
 * Invalidate the cached allowed directories. Called automatically by the
 * paths/rewire module when paths are overridden in tests.
 *
 * @example
 *   ;```typescript
 *   invalidatePathCache()
 *   // Cached allowed directories are now cleared
 *   ```
 *
 * @internal Used for test rewiring
 */
export function invalidatePathCache(): void {
  clearAllowedDirectories()
}

// Register cache invalidation with the rewire module
registerCacheInvalidation(invalidatePathCache)
