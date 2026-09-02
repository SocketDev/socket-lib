/**
 * @file String transformations: `stripBom`, `stripPaddedSuffix`,
 *   `stripSurroundingQuotes`, `toKebabCase`, `trimCharsFromEnds`,
 *   `trimNewlines`. All are pure functions with no side effects.
 */

import {
  StringPrototypeCharCodeAt,
  StringPrototypeReplace,
  StringPrototypeSlice,
} from '../primordials/string.mjs'

// A PATH entry may carry surrounding double quotes; `which` strips them too.
const quotedEntryRegExp = /^".*"$/

// The whitespace `\s` matches, as character codes, so the scans above stay
// index-based rather than re-entering the regex engine.
export function isTrimmableSpace(code: number): boolean {
  return (
    code === 32 ||
    (code >= 9 && code <= 13) ||
    code === 0xa0 ||
    code === 0xfe_ff
  )
}

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
 *   stripBom('\ufeffhello world') // 'hello world'
 *   stripBom('hello world') // 'hello world'
 *   stripBom('') // ''
 *   ```
 *
 * @param str - The string to strip BOM from.
 *
 * @returns The string without BOM
 */
export function stripBom(str: string): string {
  // In JavaScript, string data is stored as UTF-16, so BOM is 0xFEFF.
  // https://tc39.es/ecma262/#sec-unicode-format-control-characters
  return str.length > 0 && StringPrototypeCharCodeAt(str, 0) === 0xfe_ff
    ? StringPrototypeSlice(str, 1)
    : str
}

/**
 * Remove a trailing `suffix` together with any whitespace around it.
 *
 * Returns the input unchanged when the suffix is absent, so a caller can
 * compare identity to learn whether anything was removed.
 *
 * The regex form - `/\s*<suffix>\s*$/` - is polynomial: the leading `\s*` and
 * the anchored trailing `\s*` make the engine re-scan the whitespace run from
 * each start position. This walks the end of the string once instead.
 *
 * @example
 *   ;```ts
 *   stripPaddedSuffix('# END x env (managed)', '(managed)') // '# END x env'
 *   stripPaddedSuffix('# END x env', '(managed)') // '# END x env' (unchanged)
 *   ```
 *
 * @param str - The string to strip.
 * @param suffix - The literal suffix to remove.
 *
 * @returns The string without the suffix and its padding, or `str` unchanged.
 */
export function stripPaddedSuffix(str: string, suffix: string): string {
  if (suffix.length === 0) {
    return str
  }
  let end = str.length
  while (end > 0 && isTrimmableSpace(str.charCodeAt(end - 1))) {
    end -= 1
  }
  const suffixStart = end - suffix.length
  if (
    suffixStart < 0 ||
    StringPrototypeSlice(str, suffixStart, end) !== suffix
  ) {
    return str
  }
  let start = suffixStart
  while (start > 0 && isTrimmableSpace(str.charCodeAt(start - 1))) {
    start -= 1
  }
  return StringPrototypeSlice(str, 0, start)
}

/**
 * Strip the surrounding double quotes a PATH entry may carry.
 *
 * @example
 *   ;```typescript
 *   stripSurroundingQuotes('"C:\\Program Files"') // 'C:\\Program Files'
 *   ```
 */
export function stripSurroundingQuotes(entry: string): string {
  return quotedEntryRegExp.test(entry) ? entry.slice(1, -1) : entry
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
export function toKebabCase(str: string): string {
  if (!str.length) {
    return str
  }
  return (
    // camelCase→kebab boundary: group 1 = a lowercase run (optional trailing
    // digits), group 2 = the following uppercase letter; insert `-` between
    // them (`fooBar` → `foo-Bar`, later lowercased).
    StringPrototypeReplace(str, /([a-z]+[0-9]*)([A-Z])/g, '$1-$2')
      // Convert underscores to hyphens
      .replace(/_/g, '-')
      .toLowerCase()
  )
}

/**
 * Trim every leading and trailing character that appears in `chars`.
 *
 * A single index scan from each end, so cost is linear in the run actually
 * trimmed. The regex form of this - `/^[-.]+|[-.]+$/g` - is what CodeQL flags
 * as polynomial-redos: the engine retries the trailing alternative from every
 * position, so a long string of the trimmed character costs quadratic time.
 *
 * @example
 *   ;```ts
 *   trimCharsFromEnds('--a.b--', '-.') // 'a.b'
 *   trimCharsFromEnds('...', '-.') // ''
 *   trimCharsFromEnds('abc', '-.') // 'abc'
 *   ```
 *
 * @param str - The string to trim.
 * @param chars - Characters to strip from both ends.
 *
 * @returns The trimmed string.
 */
export function trimCharsFromEnds(str: string, chars: string): string {
  const { length } = str
  if (length === 0 || chars.length === 0) {
    return str
  }
  let start = 0
  while (start < length && chars.includes(str[start] as string)) {
    start += 1
  }
  if (start === length) {
    return ''
  }
  let end = length
  while (end > start && chars.includes(str[end - 1] as string)) {
    end -= 1
  }
  return start === 0 && end === length
    ? str
    : StringPrototypeSlice(str, start, end)
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
