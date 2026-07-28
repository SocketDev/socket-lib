/**
 * @file Asset matching helpers for GitHub releases.
 */

import { joinOr } from '../arrays/join'
import picomatch from '../external/picomatch'

import { ArrayIsArray } from '../primordials/array'
import {
  StringPrototypeEndsWith,
  StringPrototypeStartsWith,
} from '../primordials/string'

import type { AssetPattern } from './github-types'

/**
 * Create a matcher function for a pattern using picomatch for glob patterns or
 * simple prefix/suffix matching for object patterns.
 *
 * @example
 *   ;```typescript
 *   const isMatch = createAssetMatcher('tool-*-linux-x64')
 *   isMatch('tool-v1.0-linux-x64') // true
 *   isMatch('tool-v1.0-darwin-arm64') // false
 *   ```
 *
 * @param pattern - Pattern to match (string glob, prefix/suffix object, or
 *   RegExp)
 *
 * @returns Function that tests if a string matches the pattern
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

  // Prefix/suffix object pattern, backward compatible.
  const { prefix, suffix } = pattern
  return (input: string) =>
    StringPrototypeStartsWith(input, prefix) &&
    StringPrototypeEndsWith(input, suffix)
}

/**
 * Describe one or more asset patterns for error messages. String patterns are
 * quoted verbatim; object/RegExp patterns collapse to 'matching pattern'.
 * Multiple candidates join with "or" so a not-found error lists everything the
 * lookup tried.
 *
 * @example
 *   ;```typescript
 *   describeAssetPatterns('tool-linux-x64') // 'tool-linux-x64'
 *   describeAssetPatterns(['tool-linux-x64', 'tag-linux-x64.node'])
 *   // 'tool-linux-x64 or tag-linux-x64.node'
 *   ```
 *
 * @param patterns - Asset pattern or ordered candidate list.
 *
 * @returns Human-readable description of the pattern(s).
 */
export function describeAssetPatterns(
  patterns: AssetPattern | readonly AssetPattern[],
): string {
  const list = ArrayIsArray(patterns) ? patterns : [patterns]
  return joinOr(list.map(p => (typeof p === 'string' ? p : 'matching pattern')))
}
