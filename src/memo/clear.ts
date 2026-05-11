/**
 * @fileoverview `clearAllMemoizationCaches` — fan out to every
 * per-cache clear function registered in `_internal.cacheRegistry`.
 * Useful for tests and for callers that need to force recomputation
 * across every memoize instance.
 */

import { debugLog } from '../debug/output'

import { cacheRegistry } from './_internal'

/**
 * Clear all memoization caches.
 * Useful for testing or when you need to force recomputation.
 *
 * @example
 * ```typescript
 * clearAllMemoizationCaches()
 * ```
 */
export function clearAllMemoizationCaches(): void {
  debugLog('[memoize:all] clear', { action: 'clear-all-caches' })
  for (const clear of cacheRegistry) {
    clear()
  }
}
