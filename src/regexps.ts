/**
 * @fileoverview Regular expression utilities including escape-string-regexp implementation.
 * Provides regex escaping and pattern matching helpers.
 */

// Inlined escape-string-regexp:
// https://socket.dev/npm/package/escape-string-regexp/overview/5.0.0
// MIT License
// Copyright (c) Sindre Sorhus <sindresorhus@gmail.com> (https://sindresorhus.com)

/**
 * Escape special characters in a string for use in a regular expression.
 *
 * @example
 * ```typescript
 * escapeRegExp('foo.bar')     // 'foo\\.bar'
 * escapeRegExp('a+b*c?')     // 'a\\+b\\*c\\?'
 * new RegExp(escapeRegExp('[test]'))  // /\[test\]/
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function escapeRegExp(str: string): string {
  // Escape characters with special meaning either inside or outside
  // character sets. Includes `-` so callers that splice an escaped
  // string into a character class — e.g. `new RegExp('[' +
  // escapeRegExp(userInput) + ']')` — don't accidentally create a range
  // when input contains '-'. Matches the MDN / `escape-string-regexp`
  // reference set.
  return str.replace(/[\\|{}()[\]^$+*?.-]/g, '\\$&')
}
