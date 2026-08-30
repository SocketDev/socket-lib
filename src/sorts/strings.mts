/**
 * @file Plain string comparison. The straight-ASCII three-way compare, no
 *   locale/numeric awareness — use `localeCompare` / `naturalCompare` from the
 *   sibling files when those matter.
 */

/**
 * Simple string comparison.
 *
 * @example
 *   ;```typescript
 *   compareStr('a', 'b') // -1
 *   compareStr('b', 'a') // 1
 *   compareStr('a', 'a') // 0
 *   ```
 */
export function compareStr(a: string, b: string): number {
  return a < b ? -1 : a > b ? 1 : 0
}

/**
 * Compare two strings by length, longest first.
 *
 * This is the order a matcher wants when one candidate is a prefix of another:
 * it makes the longer name win the span instead of the shorter one claiming it
 * first. A regex alternation built from an unsorted token list matches
 * `qodo-ai` inside `qodo-ai-bot`; sorted longest-first, it does not.
 *
 * @example
 *   ;```typescript
 *   arrayToSorted(['ab', 'abcd', 'abc'], compareStrLengthDesc)
 *   // ['abcd', 'abc', 'ab']
 *   ```
 */
export function compareStrLengthDesc(a: string, b: string): number {
  return b.length - a.length
}
