/**
 * @file Public `escapeRegExp` entry — binds to native `RegExp.escape` (TC39
 *   Stage 4, Node 24+ / V8 13.7) when available, otherwise falls back to the
 *   spec-compliant implementation in `./spec`.
 */

import { escapeRegExpFallback } from './spec'

/**
 * Escape special characters in a string so the result can be safely
 * concatenated into any regular-expression Pattern position without altering
 * the meaning of surrounding syntax.
 *
 * Bound to native `RegExp.escape` when available (TC39 Stage 4, Node 24+ / V8
 * 13.7); otherwise falls back to a spec-compliant implementation. Both paths
 * satisfy the spec guarantee: `new RegExp(escapeRegExp(s))` matches exactly the
 * literal string `s`.
 *
 * Reference: https://tc39.es/ecma262/#sec-regexp.escape.
 *
 * @example
 *   ;```typescript
 *   new RegExp(escapeRegExp('[test]')) // matches literal '[test]'
 *   new RegExp('[' + escapeRegExp('a-z') + ']') // matches 'a', '-', or 'z'
 *   ```
 */
const maybeNativeEscape = (RegExp as unknown as { escape?: unknown }).escape
export const escapeRegExp: (str: string) => string =
  typeof maybeNativeEscape === 'function'
    ? (maybeNativeEscape as (str: string) => string)
    : escapeRegExpFallback
