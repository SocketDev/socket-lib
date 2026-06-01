/**
 * @file Line formatting helpers: `applyLinePrefix`, `centerText`,
 *   `indentString`, `repeatString`. Plus the `fromCharCode` re-export so
 *   callers don't have to reach into `primordials/string` for the most common
 *   use case.
 */

import { stripAnsi } from '../ansi/strip'
import { MathFloor } from '../primordials/math'
import {
  StringPrototypeIncludes,
  StringPrototypeRepeat,
} from '../primordials/string'

import type { ApplyLinePrefixOptions, IndentStringOptions } from './types'

export const fromCharCode = String.fromCharCode

/**
 * Apply a prefix to each line of a string.
 *
 * Prepends the specified prefix to the beginning of each line in the input
 * string. If the string contains newlines, the prefix is added after each
 * newline as well. When no prefix is provided or prefix is empty, returns the
 * original string unchanged.
 *
 * @example
 *   ;```ts
 *   applyLinePrefix('hello\nworld', { prefix: '> ' })
 *   // Returns: '> hello\n> world'
 *
 *   applyLinePrefix('single line', { prefix: '  ' })
 *   // Returns: '  single line'
 *
 *   applyLinePrefix('no prefix')
 *   // Returns: 'no prefix'
 *   ```
 *
 * @param str - The string to add prefixes to.
 * @param options - Configuration options.
 *
 * @returns The string with prefix applied to each line
 */
export function applyLinePrefix(
  str: string,
  options?: ApplyLinePrefixOptions | undefined,
): string {
  const { prefix = '' } = {
    __proto__: null,
    ...options,
  } as ApplyLinePrefixOptions
  return prefix.length
    ? `${prefix}${StringPrototypeIncludes(str, '\n') ? str.replace(/\n/g, `\n${prefix}`) : str}`
    : str
}

/**
 * Center text within a given width.
 *
 * Adds spaces before and after the text to center it within the specified
 * width. Distributes padding evenly on both sides. When the padding is odd, the
 * extra space is added to the right side. Strips ANSI codes before calculating
 * text length to ensure accurate centering of colored text.
 *
 * If the text is already wider than or equal to the target width, returns the
 * original text unchanged (no truncation occurs).
 *
 * @example
 *   ;```ts
 *   centerText('hello', 11)
 *   // Returns: '   hello   '
 *
 *   centerText('hi', 10)
 *   // Returns: '    hi    '
 *
 *   centerText('odd', 8)
 *   // Returns: '  odd   ' (2 left, 3 right)
 *
 *   centerText('\x1b[31mred\x1b[0m', 7)
 *   // Returns: '  \x1b[31mred\x1b[0m  '
 *
 *   centerText('too long text', 5)
 *   // Returns: 'too long text' (no truncation)
 *   ```
 *
 * @param text - The text to center (may include ANSI codes)
 * @param width - The target width in columns.
 *
 * @returns The centered text with padding
 */
export function centerText(text: string, width: number): string {
  const textLength = stripAnsi(text).length
  if (textLength >= width) {
    return text
  }

  const padding = width - textLength
  const leftPad = MathFloor(padding / 2)
  const rightPad = padding - leftPad

  return ' '.repeat(leftPad) + text + ' '.repeat(rightPad)
}

/**
 * Indent each line of a string with spaces.
 *
 * Adds the specified number of spaces to the beginning of each non-empty line
 * in the input string. Empty lines (containing only whitespace) are not
 * indented. Uses a regular expression to efficiently handle multi-line
 * strings.
 *
 * @example
 *   ;```ts
 *   indentString('hello\nworld', { count: 2 })
 *   // Returns: '  hello\n  world'
 *
 *   indentString('line1\n\nline3', { count: 4 })
 *   // Returns: '    line1\n\n    line3'
 *
 *   indentString('single line')
 *   // Returns: ' single line' (default: 1 space)
 *   ```
 *
 * @param str - The string to indent.
 * @param options - Configuration options.
 *
 * @returns The indented string
 */
export function indentString(
  str: string,
  options?: IndentStringOptions | undefined,
): string {
  const { count = 1 } = { __proto__: null, ...options } as IndentStringOptions
  return str.replace(/^(?!\s*$)/gm, ' '.repeat(count))
}

/**
 * Repeat a string a specified number of times.
 *
 * Creates a new string by repeating the input string `count` times. Returns an
 * empty string if count is 0 or negative.
 *
 * @example
 *   ;```ts
 *   repeatString('hello', 3) // 'hellohellohello'
 *   repeatString('x', 5) // 'xxxxx'
 *   repeatString('hello', 0) // ''
 *   repeatString('hello', -1) // ''
 *   ```
 *
 * @param str - The string to repeat.
 * @param count - The number of times to repeat the string.
 *
 * @returns The repeated string, or empty string if count <= 0
 */
export function repeatString(str: string, count: number): string {
  if (count <= 0) {
    return ''
  }
  return StringPrototypeRepeat(str, count)
}
