/**
 * @file Path rewiring utilities for testing. Allows tests to override
 *   os.tmpdir() and os.homedir() without directly modifying them. Features:
 *
 *   - Test-friendly setPath/clearPath/resetPaths that work in
 *     beforeEach/afterEach
 *   - Automatic cache invalidation for path-dependent modules
 *   - Thread-safe for concurrent test execution
 */

import { MapCtor } from '../primordials/map-set.mjs'
// Shared test hook state (setPath/clearPath/resetPaths in beforeEach/afterEach)
// IMPORTANT: Use globalThis to ensure singleton across duplicate module instances.
// Vitest alias resolution can create separate module instances for the same file
// (e.g. '@socketsecurity/lib/paths/rewire' vs relative '../paths/rewire').
// Both must share the same Maps for rewiring to work correctly.
// Only initialize in test environment to avoid polluting production runtime.
// Vitest automatically sets VITEST=true when running tests.
export interface PathRewireState {
  testOverrides: Map<string, string | undefined>
  cacheInvalidationCallbacks: Array<() => void>
}

const stateSymbol = Symbol.for('@socketsecurity/lib/paths/rewire/state')
const globalState = globalThis as typeof globalThis &
  Record<symbol, PathRewireState | undefined>
if (!globalState[stateSymbol]) {
  globalState[stateSymbol] = {
    testOverrides: new MapCtor<string, string | undefined>(),
    cacheInvalidationCallbacks: [] as Array<() => void>,
  }
}

const sharedState: PathRewireState = globalState[stateSymbol]!

// Per-test overrides
const testOverrides = sharedState.testOverrides

// Cache invalidation callbacks - registered by modules that need to clear their caches
const cacheInvalidationCallbacks = sharedState.cacheInvalidationCallbacks

/**
 * Clear a specific path override.
 */
export function clearPath(key: string): void {
  testOverrides.delete(key)
  // Invalidate all path-related caches
  invalidateCaches()
}

/**
 * Get a path value, checking overrides first.
 *
 * Resolution order:
 *
 * 1. Test overrides, set via setPath in beforeEach.
 * 2. Original function call, recomputed on every call.
 *
 * `originalFn` is not memoized here: its typical inputs (env vars such as
 * HOME / SOCKET_HOME, os.homedir(), os.tmpdir()) can change without going
 * through setPath/clearPath/resetPaths - `env/rewire`'s setEnv/clearEnv, or a
 * direct process.env write, update those inputs without calling this
 * module's invalidateCaches(). A memo keyed only on `key` would then serve a
 * value computed against the OLD input forever, since nothing here observes
 * the env change to know the memo is stale. `originalFn` is a cheap pure
 * read (a string join, an env lookup) in every current caller, so recomputing
 * it every call costs nothing measurable and removes the staleness class
 * entirely.
 *
 * @internal Used by path getters to support test rewiring
 */
export function getPathValue(key: string, originalFn: () => string): string {
  // Check test overrides first
  if (testOverrides.has(key)) {
    return testOverrides.get(key) as string
  }

  return originalFn()
}

/**
 * Check if a path has been overridden.
 */
export function hasOverride(key: string): boolean {
  return testOverrides.has(key)
}

/**
 * Run every registered cache-invalidation callback. Called automatically
 * when setPath/clearPath/resetPaths are used, so a module that maintains its
 * OWN cache derived from a path (via registerCacheInvalidation) still gets
 * to clear it on override changes. getPathValue itself has nothing to
 * invalidate - it no longer memoizes - so this only reaches other modules'
 * registered caches.
 *
 * @internal Primarily for internal use, but exported for advanced testing
 */
export function invalidateCaches(): void {
  // Call registered callbacks
  for (const callback of cacheInvalidationCallbacks) {
    try {
      callback()
    } catch {
      // Ignore errors from cache invalidation
    }
  }
}

/**
 * Register a cache invalidation callback. Called by modules that need to clear
 * their caches when paths change.
 *
 * @internal Used by paths.ts and fs.ts
 */
export function registerCacheInvalidation(callback: () => void): void {
  cacheInvalidationCallbacks.push(callback)
}

/**
 * Clear all path overrides and reset caches. Useful in afterEach hooks to
 * ensure clean test state.
 *
 * @example
 *   ;```typescript
 *   import { resetPaths } from '#paths/rewire'
 *
 *   afterEach(() => {
 *     resetPaths()
 *   })
 *   ```
 */
export function resetPaths(): void {
  testOverrides.clear()
  // Invalidate all path-related caches
  invalidateCaches()
}

/**
 * Set a path override for testing. This triggers cache invalidation for
 * path-dependent modules.
 *
 * @example
 *   ;```typescript
 *   import { setPath, resetPaths } from '#paths/rewire'
 *   import { getOsTmpDir } from './'
 *
 *   beforeEach(() => {
 *     setPath('tmpdir', '/custom/tmp')
 *   })
 *
 *   afterEach(() => {
 *     resetPaths()
 *   })
 *
 *   it('should use custom temp directory', () => {
 *     expect(getOsTmpDir()).toBe('/custom/tmp')
 *   })
 *   ```
 */
export function setPath(key: string, value: string | undefined): void {
  testOverrides.set(key, value)
  // Invalidate all path-related caches
  invalidateCaches()
}
