/**
 * @file String predicates: `isBlankString` and `isNonEmptyString`. Both are
 *   TypeScript type guards so callers can narrow `unknown` → `string` (or
 *   `BlankString` / non-empty string) without an extra cast.
 */

import type { BlankString, EmptyString } from './types'

/**
 * Check if a value is a blank string (empty or only whitespace).
 *
 * A blank string is defined as a string that is either: - Completely empty
 * (length 0) - Contains only whitespace characters (spaces, tabs, newlines,
 * etc.)
 *
 * This is useful for validation when you need to ensure user input contains
 * actual content, not just whitespace.
 *
 * @example
 *   ;```ts
 *   isBlankString('') // true
 *   isBlankString('   ') // true
 *   isBlankString('\n\t  ') // true
 *   isBlankString('hello') // false
 *   isBlankString(null) // false
 *   ```
 *
 * @param value - The value to check.
 *
 * @returns `true` if the value is a blank string, `false` otherwise
 */
export function isBlankString(value: unknown): value is BlankString {
  return typeof value === 'string' && (!value.length || /^\s+$/.test(value))
}

/**
 * Check if a value is a non-empty string.
 *
 * Returns `true` only if the value is a string with at least one character.
 * This includes strings containing only whitespace (use `isBlankString()` if
 * you want to exclude those). Type guard ensures TypeScript knows the value is
 * a string after this check.
 *
 * @example
 *   ;```ts
 *   isNonEmptyString('hello') // true
 *   isNonEmptyString('   ') // true (contains whitespace)
 *   isNonEmptyString('') // false
 *   isNonEmptyString(null) // false
 *   isNonEmptyString(123) // false
 *   ```
 *
 * @param value - The value to check.
 *
 * @returns `true` if the value is a non-empty string, `false` otherwise
 */
export function isNonEmptyString(
  value: unknown,
): value is Exclude<string, EmptyString> {
  return typeof value === 'string' && value.length > 0
}
