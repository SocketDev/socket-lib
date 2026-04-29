/**
 * @fileoverview Asset matching helpers for GitHub releases.
 */

import picomatch from '../external/picomatch'

/**
 * Create a matcher function for a pattern using picomatch for glob patterns
 * or simple prefix/suffix matching for object patterns.
 *
 * @param pattern - Pattern to match (string glob, prefix/suffix object, or RegExp)
 * @returns Function that tests if a string matches the pattern
 *
 * @example
 * ```typescript
 * const isMatch = createAssetMatcher('tool-*-linux-x64')
 * isMatch('tool-v1.0-linux-x64')  // true
 * isMatch('tool-v1.0-darwin-arm64')  // false
 * ```
 */
export function createAssetMatcher(
  pattern: string | { prefix: string; suffix: string } | RegExp,
): (input: string) => boolean {
  if (typeof pattern === 'string') {
    // Use picomatch for glob pattern matching.
    const isMatch = picomatch(pattern)
    return (input: string) => isMatch(input)
  }

  if (pattern instanceof RegExp) {
    return (input: string) => pattern.test(input)
  }

  // Prefix/suffix object pattern (backward compatible).
  const { prefix, suffix } = pattern
  return (input: string) => input.startsWith(prefix) && input.endsWith(suffix)
}
