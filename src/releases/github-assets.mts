/**
 * @file Asset matching helpers for GitHub releases.
 */

import { joinOr } from '../arrays/join.mjs'
import picomatch from '../external/picomatch.js'

import { ArrayIsArray } from '../primordials/array.mjs'

import type { AssetPattern } from './github-types.mjs'

/**
 * Create a matcher function for a pattern using picomatch for glob patterns or
 * a RegExp test for complex patterns.
 *
 * @example
 *   ;```typescript
 *   const isMatch = createAssetMatcher('tool-*-linux-x64')
 *   isMatch('tool-v1.0-linux-x64') // true
 *   isMatch('tool-v1.0-darwin-arm64') // false
 *   ```
 *
 * @param pattern - Pattern to match (string glob or RegExp)
 *
 * @returns Function that tests if a string matches the pattern
 */
export function createAssetMatcher(
  pattern: AssetPattern,
): (input: string) => boolean {
  if (typeof pattern === 'string') {
    // Use picomatch for glob pattern matching.
    const isMatch = picomatch(pattern)
    return (input: string) => isMatch(input)
  }

  return (input: string) => pattern.test(input)
}

/**
 * Describe one or more asset patterns for error messages. String patterns are
 * quoted verbatim; RegExp patterns collapse to 'matching pattern'. Multiple
 * candidates join with "or" so a not-found error lists everything the lookup
 * tried.
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
