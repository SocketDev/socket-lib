/**
 * @file Newline-aware line splitting. A raw `text.split('\n')` over CRLF input
 *   leaves a trailing `\r` on every line, breaking downstream `includes` /
 *   regex-anchor checks, and misses legacy-Mac bare-`\r` files entirely.
 *   `splitLines` handles all three conventions in one pass.
 */

export interface SplitLinesOptions {
  skipEmpty?: boolean | undefined
  trim?: boolean | undefined
}

// The three legal newline conventions: `\r\n` (Windows), bare `\r` (legacy
// Mac), `\n` (Unix). CRLF must be listed first so it consumes as one break
// instead of two.
const LINE_BREAK_RE = /\r\n|\r|\n/

/**
 * Split text into lines across the three newline conventions: `\r\n`
 * (Windows), bare `\r` (legacy Mac), and `\n` (Unix).
 *
 * Returns one entry per logical line. A trailing newline produces an empty
 * trailing entry, matching `split('\n')` semantics. Pass `trim` to strip
 * surrounding whitespace from each line, and `skipEmpty` to drop empty lines
 * (after trimming, when both are set).
 *
 * @example
 *   ;```ts
 *   splitLines('a\r\nb\rc\nd') // ['a', 'b', 'c', 'd']
 *   splitLines('a\n\nb\n') // ['a', '', 'b', '']
 *   splitLines('  a  \n\nb', { trim: true, skipEmpty: true }) // ['a', 'b']
 *   ```
 *
 * @param text - The text to split.
 * @param options - Optional `trim` / `skipEmpty` behavior.
 *
 * @returns The logical lines of `text`.
 */
export function splitLines(
  text: string,
  options?: SplitLinesOptions | undefined,
): string[] {
  const { skipEmpty = false, trim = false } = {
    __proto__: null,
    ...options,
  } as SplitLinesOptions
  let lines = text.split(LINE_BREAK_RE)
  if (trim) {
    lines = lines.map(line => line.trim())
  }
  if (skipEmpty) {
    lines = lines.filter(line => line.length > 0)
  }
  return lines
}
