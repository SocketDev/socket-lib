/**
 * @fileoverview Private internals for `memo/*` modules — the
 * shared `cacheRegistry` (each memoize variant registers its
 * per-instance clear function here so `clearAllMemoizationCaches`
 * can fan out). `defaultKeyGen` is co-located because both `memoize`
 * and `memoizeAsync` use it as the default cache-key encoder.
 */

import { JSONStringify } from '../primordials/json'

/**
 * Global registry of memoization cache clear functions.
 */
export const cacheRegistry: Array<() => void> = []

/**
 * Default cache key generator that disambiguates `undefined`, `BigInt`, and
 * `Map`/`Set` arguments (which `JSON.stringify` drops or collapses).
 */
export function defaultKeyGen(args: readonly unknown[]): string {
  return JSONStringify(args, (_key, value) => {
    if (value === undefined) {
      return '\0undefined'
    }
    if (typeof value === 'bigint') {
      return `\0bigint:${value.toString()}`
    }
    if (typeof value === 'function') {
      // 'anonymous' fallback fires only when value is anonymous fn;
      // tested in memoization-extras.test.mts.
      /* c8 ignore next */
      return `\0fn:${value.name || 'anonymous'}`
    }
    if (value instanceof Map) {
      return { __tag: 'Map', entries: Array.from(value.entries()) }
    }
    if (value instanceof Set) {
      return { __tag: 'Set', values: Array.from(value.values()) }
    }
    return value
  })
}
