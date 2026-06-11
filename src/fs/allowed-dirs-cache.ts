/**
 * @file Cache-invalidation entry point for the allowed-directories list used by
 *   `safeDelete` / `safeDeleteSync`. Loading this module registers
 *   `invalidatePathCache` with `paths/rewire.ts` so test-time path overrides
 *   flush the cache; the registration is the module's only side effect, so
 *   callers that just need to flush the cache imperatively can call
 *   `invalidatePathCache()` directly without that side effect repeating. The
 *   registration is deferred to a microtask (`registerInvalidationCallback`)
 *   rather than run at top-level module load. This module sits in a require
 *   cycle (`allowed-dirs-cache → _internal → paths/socket → …`); in the bundled
 *   CJS the `registerCacheInvalidation` import binding from `paths/rewire` is
 *   not yet initialized when this module first evaluates, so a synchronous
 *   top-level call threw `registerCacheInvalidation is not defined` at require
 *   time. Deferring to a microtask runs the call after the module graph has
 *   settled, breaking the init-order hazard while keeping the load-time
 *   registration contract (the callback is in place before any test hook
 *   fires).
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

/**
 * Register `invalidatePathCache` with the rewire module after the current
 * module-init turn, so the circular import is fully wired before the call.
 *
 * @internal
 */
export function registerInvalidationCallback(): void {
  registerCacheInvalidation(invalidatePathCache)
}

// Defer registration past module-init to clear the require cycle (see @file).
queueMicrotask(registerInvalidationCallback)
