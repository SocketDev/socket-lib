/**
 * @fileoverview Case-insensitive environment-variable key lookup —
 * `findCaseInsensitiveEnvKey` walks `Object.keys(env)` with an O(1)
 * length-prefilter before the (expensive) `toUpperCase` comparison.
 * Used by `createEnvProxy` for Windows-style PATH/Path/path access.
 */

import { ObjectKeys } from '../primordials/object'

/**
 * Find a case-insensitive environment variable key match.
 * Searches for an environment variable key that matches the given uppercase name,
 * using optimized fast-path checks to minimize expensive toUpperCase() calls.
 *
 * **Use Cases:**
 * - Finding PATH when env object has "Path" or "path"
 * - Cross-platform env var access where case may vary
 * - Custom case-insensitive env lookups
 *
 * **Performance:**
 * - Fast path: Checks length first (O(1)) before toUpperCase (expensive)
 * - Only converts to uppercase when length matches
 * - Early exit on first match
 *
 * @param env - Environment object or env-like record to search
 * @param upperEnvVarName - Uppercase environment variable name to find (e.g., 'PATH')
 * @returns The actual key from env that matches (e.g., 'Path'), or undefined
 *
 * @example
 * // Find PATH regardless of case
 * const envObj = { Path: 'C:\\Windows', NODE_ENV: 'test' }
 * const key = findCaseInsensitiveEnvKey(envObj, 'PATH')
 * console.log(key)  // 'Path'
 * console.log(envObj[key])  // 'C:\\Windows'
 *
 * @example
 * // Not found returns undefined
 * const key = findCaseInsensitiveEnvKey({}, 'MISSING')
 * console.log(key)  // undefined
 */
export function findCaseInsensitiveEnvKey(
  env: Record<string, string | undefined>,
  upperEnvVarName: string,
): string | undefined {
  const targetLength = upperEnvVarName.length
  for (const key of ObjectKeys(env)) {
    // Fast path: bail early if lengths don't match.
    if (key.length !== targetLength) {
      continue
    }
    // Only call toUpperCase if length matches.
    if (key.toUpperCase() === upperEnvVarName) {
      return key
    }
  }
  return undefined
}
