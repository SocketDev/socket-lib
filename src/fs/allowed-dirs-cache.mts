/**
 * @file Cache-invalidation entry point for the allowed-directories list used by
 *   `safeDelete` / `safeDeleteSync`. Loading this module registers
 *   `invalidatePathCache` with `paths/rewire.ts` so test-time path overrides
 *   flush the cache; the registration is the module's only side effect, so
 *   callers that just need to flush the cache imperatively can call
 *   `invalidatePathCache()` directly without that side effect repeating. The
 *   registration is deferred to a microtask (`registerInvalidationCallback`)
 *   rather than run at top-level module load. This module sits in a require
 *   cycle (`allowed-dirs-cache → shared → paths/socket → …`); in the bundled
 *   CJS the `registerCacheInvalidation` import binding from `paths/rewire` is
 *   not yet initialized when this module first evaluates, so a synchronous
 *   top-level call threw `registerCacheInvalidation is not defined` at require
 *   time. Deferring to a microtask runs the call after the module graph has
 *   settled, breaking the init-order hazard while keeping the load-time
 *   registration contract (the callback is in place before any test hook
 *   fires).
 */

import { registerCacheInvalidation } from '../paths/rewire.mjs'

import { clearAllowedDirectories } from './shared.mjs'

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
 * Guarded + self-rescheduling: in the require cycle (`allowed-dirs-cache →
 * shared → paths/socket → … → rewire`) the `registerCacheInvalidation` live
 * binding can still be in its temporal dead zone when the first microtask fires
 * under some import orders, throwing `registerCacheInvalidation is not
 * defined`. Vitest loads many modules concurrently, so those orders do come up.
 * Check that the binding is callable; if not, re-defer to the next microtask.
 * The registration is a test-injection best-effort that lets path-rewire flush
 * this cache, so a bounded retry that lands on a later turn is correct. A
 * never-resolving binding, as in production where rewire is unused, simply
 * stops retrying without throwing.
 *
 * @internal
 */
export function registerInvalidationCallback(attempt: number = 0): void {
  // The access is wrapped: a still-uninitialized live binding throws ReferenceError
  // (bundled CJS, where it reads `undefined`) or a TDZ error (transformed ESM under
  // vitest). Catch both, re-defer a bounded number of turns, and give up silently
  // if it never resolves, as in production where rewire is unused. Never throw.
  try {
    if (typeof registerCacheInvalidation === 'function') {
      registerCacheInvalidation(invalidatePathCache)
      return
    }
  } catch {
    // binding not yet initialized — fall through to re-defer
  }
  if (attempt < 10) {
    queueMicrotask(() => registerInvalidationCallback(attempt + 1))
  }
}

// Defer registration past module-init to clear the require cycle (see @file).
queueMicrotask(() => registerInvalidationCallback())
