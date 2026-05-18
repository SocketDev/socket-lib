/**
 * @file String transformations: `stripBom`, `toKebabCase`, `trimNewlines`. All
 *   three are pure functions with no side effects.
 */

import {
  StringPrototypeCharCodeAt,
  StringPrototypeReplace,
  StringPrototypeSlice,
} from '../primordials/string'

/**
 * Strip the Byte Order Mark (BOM) from the beginning of a string.
 *
 * The BOM (U+FEFF) is a Unicode character that can appear at the start of a
 * text file to indicate byte order and encoding. In UTF-16 (JavaScript's
 * internal string representation), it appears as 0xFEFF. This function removes
 * it if present, leaving the rest of the string unchanged.
 *
 * Most text processing doesn't need to handle the BOM explicitly, but it can
 * cause issues when parsing JSON, CSV, or other structured data formats that
 * don't expect a leading invisible character.
 *
 * @example
 *   ;```ts
 *   stripBom('﻿hello world') // 'hello world'
 *   stripBom('hello world') // 'hello world'
 *   stripBom('') // ''
 *   ```
 *
 * @param str - The string to strip BOM from.
 *
 * @returns The string without BOM
 */
/*@__NO_SIDE_EFFECTS__*/
export function stripBom(str: string): string {
  // In JavaScript, string data is stored as UTF-16, so BOM is 0xFEFF.
  // https://tc39.es/ecma262/#sec-unicode-format-control-characters
  return str.length > 0 && StringPrototypeCharCodeAt(str, 0) === 0xfe_ff
    ? StringPrototypeSlice(str, 1)
    : str
}

/**
 * Convert a string to kebab-case (handles camelCase and snake_case).
 *
 * Transforms strings from camelCase or snake_case to kebab-case by:
 *
 * - Converting uppercase letters to lowercase
 * - Inserting hyphens before uppercase letters (for camelCase)
 * - Replacing underscores with hyphens (for snake_case)
 *
 * Handles mixed formats (camelCase, snake_case, acronyms) in one pass. Returns
 * empty string for empty input.
 *
 * @example
 *   ;```ts
 *   toKebabCase('helloWorld') // 'hello-world'
 *   toKebabCase('hello_world') // 'hello-world'
 *   toKebabCase('XMLHttpRequest') // 'xmlhttp-request'
 *   toKebabCase('iOS_Version') // 'i-os-version'
 *   toKebabCase('') // ''
 *   ```
 *
 * @param str - The string to convert.
 *
 * @returns The kebab-case string
 */
/*@__NO_SIDE_EFFECTS__*/
export function toKebabCase(str: string): string {
  if (!str.length) {
    return str
  }
  return (
    StringPrototypeReplace(str, /([a-z]+[0-9]*)([A-Z])/g, '$1-$2')
      // Convert underscores to hyphens
      .replace(/_/g, '-')
      .toLowerCase()
  )
}

/**
 * Trim newlines from the beginning and end of a string.
 *
 * Removes all leading and trailing newline characters (both `\n` and `\r`) from
 * a string, while preserving any newlines in the middle. This is similar to
 * `String.prototype.trim()` but specifically targets newlines instead of all
 * whitespace.
 *
 * Optimized for performance by checking the first and last characters before
 * doing any string manipulation. Returns the original string unchanged if no
 * newlines are found at the edges.
 *
 * @example
 *   ;```ts
 *   trimNewlines('\n\nhello\n\n') // 'hello'
 *   trimNewlines('\r\nworld\r\n') // 'world'
 *   trimNewlines('hello\nworld') // 'hello\nworld' (middle preserved)
 *   trimNewlines('  hello  ') // '  hello  ' (spaces not trimmed)
 *   trimNewlines('hello') // 'hello'
 *   ```
 *
 * @param str - The string to trim.
 *
 * @returns The string with leading and trailing newlines removed
 */
/*@__NO_SIDE_EFFECTS__*/
export function trimNewlines(str: string): string {
  const { length } = str
  if (length === 0) {
    return str
  }
  const first = StringPrototypeCharCodeAt(str, 0)
  const noFirstNewline = first !== 13 /*'\r'*/ && first !== 10 /*'\n'*/
  if (length === 1) {
    return noFirstNewline ? str : ''
  }
  const last = StringPrototypeCharCodeAt(str, length - 1)
  const noLastNewline = last !== 13 /*'\r'*/ && last !== 10 /*'\n'*/
  if (noFirstNewline && noLastNewline) {
    return str
  }
  let start = 0
  let end = length
  while (start < end) {
    const code = StringPrototypeCharCodeAt(str, start)
    if (code !== 13 /*'\r'*/ && code !== 10 /*'\n'*/) {
      break
    }
    start += 1
  }
  while (end > start) {
    const code = StringPrototypeCharCodeAt(str, end - 1)
    if (code !== 13 /*'\r'*/ && code !== 10 /*'\n'*/) {
      break
    }
    end -= 1
  }
  return start === 0 && end === length
    ? str
    : StringPrototypeSlice(str, start, end)
}
