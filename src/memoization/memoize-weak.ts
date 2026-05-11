/**
 * @fileoverview `memoizeWeak` — memoizer keyed by an object reference
 * via `WeakMap`. Cache entries are eligible for GC as soon as the
 * keying object becomes unreachable, so there's no need for explicit
 * eviction. First (and only) argument must be an object.
 */

import { debugLog } from '../debug/output'
import { WeakMapCtor } from '../primordials/map-set'

/**
 * Memoize with WeakMap for object keys.
 * Allows garbage collection when objects are no longer referenced.
 * Only works when first argument is an object.
 *
 * @param fn - Function to memoize
 * @returns Memoized version using WeakMap
 *
 * @example
 * import { memoizeWeak } from '@socketsecurity/lib/memoization/memoize-weak'
 *
 * const processConfig = memoizeWeak((config: Config) => {
 *   return expensiveTransform(config)
 * })
 *
 * processConfig(config1) // Computed
 * processConfig(config1) // Cached
 * // When config1 is no longer referenced, cache entry is GC'd
 */
export function memoizeWeak<K extends object, Result>(
  fn: (key: K) => Result,
): (key: K) => Result {
  const cache = new WeakMapCtor<K, Result>()

  return function memoized(key: K): Result {
    if (cache.has(key)) {
      debugLog(`[memoizeWeak:${fn.name}] hit`)
      return cache.get(key) as Result
    }

    debugLog(`[memoizeWeak:${fn.name}] miss`)
    const result = fn(key)
    cache.set(key, result)
    return result
  }
}
