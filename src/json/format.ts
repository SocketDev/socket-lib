/**
 * @fileoverview Shared utilities for JSON formatting preservation and manipulation.
 * Provides functions for detecting and preserving indentation, line endings, and
 * determining when JSON files should be saved based on content changes.
 */

/**
 * Symbols used to store formatting metadata in JSON objects.
 */
export const INDENT_SYMBOL = Symbol.for('indent')
export const NEWLINE_SYMBOL = Symbol.for('newline')

/**
 * Formatting metadata for JSON files.
 */
export interface JsonFormatting {
  indent: string | number
  newline: string
}

/**
 * Options for determining if a save should occur.
 */
export interface ShouldSaveOptions {
  ignoreWhitespace?: boolean
  sort?: boolean
  sortFn?: (obj: Record<string, unknown>) => Record<string, unknown>
}

/**
 * Detect indentation from a JSON string.
 * Supports space-based indentation (returns count) or mixed indentation (returns string).
 *
 * @param json - JSON string to analyze
 * @returns Number of spaces or indentation string, defaults to 2 if not detected
 *
 * @example
 * ```ts
 * detectIndent('{\n  "key": "value"\n}')  // => 2
 * detectIndent('{\n    "key": "value"\n}')  // => 4
 * detectIndent('{\n\t"key": "value"\n}')  // => '\t'
 * ```
 */
export function detectIndent(json: string): string | number {
  const match = json.match(/^[{[][\r\n]+(\s+)/m)
  if (!match) {
    // Default to 2 spaces
    return 2
  }
  const indent = match[1]
  // Check if all spaces (return count) or mixed (return string)
  if (/^ +$/.test(indent)) {
    return indent.length
  }
  return indent
}

/**
 * Detect newline character(s) from a JSON string.
 * Supports LF (\n) and CRLF (\r\n) line endings.
 *
 * @param json - JSON string to analyze
 * @returns Line ending string ('\n' or '\r\n'), defaults to '\n' if not detected
 *
 * @example
 * ```ts
 * detectNewline('{\n  "key": "value"\n}')  // => '\n'
 * detectNewline('{\r\n  "key": "value"\r\n}')  // => '\r\n'
 * ```
 */
export function detectNewline(json: string): string {
  const match = json.match(/\r?\n/)
  return match ? match[0] : '\n'
}

/**
 * Extract formatting metadata from a JSON string.
 *
 * @param json - JSON string to analyze
 * @returns Object containing indent and newline formatting
 *
 * @example
 * ```ts
 * const formatting = extractFormatting('{\n  "key": "value"\n}')
 * // => { indent: 2, newline: '\n' }
 * ```
 */
export function extractFormatting(json: string): JsonFormatting {
  return {
    indent: detectIndent(json),
    newline: detectNewline(json),
  }
}

/**
 * Get default formatting for JSON files.
 *
 * @returns Default formatting (2 spaces, LF line endings)
 */
export function getDefaultFormatting(): JsonFormatting {
  return {
    indent: 2,
    newline: '\n',
  }
}

/**
 * Sort object keys alphabetically.
 * Creates a new object with sorted keys (does not mutate input).
 *
 * @param obj - Object to sort
 * @returns New object with alphabetically sorted keys
 *
 * @example
 * ```ts
 * sortKeys({ z: 3, a: 1, m: 2 })
 * // => { a: 1, m: 2, z: 3 }
 * ```
 */
export function sortKeys(
  obj: Record<string, unknown>,
): Record<string, unknown> {
  const sorted: Record<string, unknown> = { __proto__: null }
  const keys = Object.keys(obj).sort()
  for (const key of keys) {
    sorted[key] = obj[key]
  }
  return sorted
}

/**
 * Stringify JSON with specific formatting.
 * Applies indentation and line ending preferences.
 *
 * @param content - Object to stringify
 * @param formatting - Formatting preferences (indent and newline)
 * @returns Formatted JSON string with trailing newline
 *
 * @example
 * ```ts
 * stringifyWithFormatting(
 *   { key: 'value' },
 *   { indent: 4, newline: '\r\n' }
 * )
 * // => '{\r\n    "key": "value"\r\n}\r\n'
 * ```
 */
export function stringifyWithFormatting(
  content: Record<string, unknown>,
  formatting: JsonFormatting,
): string {
  const { indent, newline } = formatting
  const format = indent === undefined || indent === null ? '  ' : indent
  const eol = newline === undefined || newline === null ? '\n' : newline

  return `${JSON.stringify(content, undefined, format)}\n`.replace(/\n/g, eol)
}

/**
 * Strip formatting symbols from content object.
 * Removes Symbol.for('indent') and Symbol.for('newline') from the object.
 *
 * @param content - Content object with potential symbol properties
 * @returns Object with symbols removed
 */
export function stripFormattingSymbols(
  content: Record<string | symbol, unknown>,
): Record<string, unknown> {
  const {
    [INDENT_SYMBOL]: _indent,
    [NEWLINE_SYMBOL]: _newline,
    ...rest
  } = content
  return rest
}

/**
 * Extract formatting from content object that has symbol-based metadata.
 *
 * @param content - Content object with Symbol.for('indent') and Symbol.for('newline')
 * @returns Formatting metadata, or defaults if symbols not present
 */
export function getFormattingFromContent(
  content: Record<string | symbol, unknown>,
): JsonFormatting {
  const indent = content[INDENT_SYMBOL]
  const newline = content[NEWLINE_SYMBOL]

  return {
    indent:
      indent === undefined || indent === null ? 2 : (indent as string | number),
    newline:
      newline === undefined || newline === null ? '\n' : (newline as string),
  }
}

/**
 * Determine if content should be saved based on changes and options.
 * Compares current content with original content and respects options like
 * ignoreWhitespace and sort.
 *
 * @param currentContent - Current content object (may include formatting symbols)
 * @param originalContent - Original content for comparison (may include formatting symbols)
 * @param originalFileContent - Original file content as string (for whitespace comparison)
 * @param options - Options controlling save behavior
 * @returns true if content should be saved, false otherwise
 *
 * @example
 * ```ts
 * const current = { key: 'new-value', [Symbol.for('indent')]: 2 }
 * const original = { key: 'old-value', [Symbol.for('indent')]: 2 }
 * shouldSave(current, original, '{\n  "key": "old-value"\n}\n')
 * // => true
 * ```
 */
export function shouldSave(
  currentContent: Record<string | symbol, unknown>,
  originalContent: Record<string | symbol, unknown> | undefined,
  originalFileContent: string,
  options: ShouldSaveOptions = {},
): boolean {
  const { ignoreWhitespace = false, sort = false, sortFn } = options

  // Extract content without formatting symbols
  const content = stripFormattingSymbols(currentContent)
  // Use custom sort function if provided, otherwise use default sort or no sort
  const sortedContent = sortFn
    ? sortFn(content)
    : sort
      ? sortKeys(content)
      : content

  // Extract original content without symbols
  const origContent = originalContent
    ? stripFormattingSymbols(originalContent)
    : {}

  // If ignoring whitespace, only compare content
  if (ignoreWhitespace) {
    // Use util.isDeepStrictEqual for comparison
    const util = require('node:util')
    return !util.isDeepStrictEqual(sortedContent, origContent)
  }

  // Get formatting from current content
  const formatting = getFormattingFromContent(currentContent)

  // Generate what the file content would be
  const newFileContent = stringifyWithFormatting(sortedContent, formatting)

  // Compare trimmed content to detect actual changes
  return newFileContent.trim() !== originalFileContent.trim()
}
