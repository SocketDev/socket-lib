/**
 * @file `stringWidth` — calculate visual terminal width. Based on string-width
 *   by Sindre Sorhus
 *   (https://socket.dev/npm/package/string-width/overview/7.2.0, MIT). Why this
 *   lives in its own leaf:
 *
 *   - It carries a heavy module-level setup: `Intl.Segmenter` instance,
 *     feature-detected regex patterns (with `'v'` flag fallback to `'u'`), and
 *     a lazy `eastAsianWidth` accessor.
 *   - The function body is ~150 lines of carefully-commented Unicode handling —
 *     keeping it isolated makes it easy to review changes without touching the
 *     rest of the strings surface. See the comments inside for the algorithm
 *     details and Unicode Standard Annex #11 references.
 */

import { stripAnsi } from '../ansi/strip'
import { RegExpPrototypeTest } from '../primordials/regexp'
import {
  StringPrototypeCharCodeAt,
  StringPrototypeCodePointAt,
} from '../primordials/string'

import type { eastAsianWidth as eastAsianWidthType } from '../external/get-east-asian-width'

let _eastAsianWidth: typeof eastAsianWidthType | undefined
/*@__NO_SIDE_EFFECTS__*/
export function getEastAsianWidth() {
  if (_eastAsianWidth === undefined) {
    // The /*@__PURE__*/ stays adjacent to the require() call — oxfmt
    // reformats `(/*@__PURE__*/ require(…) as T).x` back into the
    // outside-paren form that rolldown doesn't honor; using an
    // intermediate const sidesteps the reformat. See task #23.
    const mod = /*@__PURE__*/ require('../external/get-east-asian-width') as {
      eastAsianWidth: typeof eastAsianWidthType
    }
    _eastAsianWidth = mod.eastAsianWidth
  }
  return _eastAsianWidth!
}

// Initialize Intl.Segmenter for proper grapheme cluster segmentation.
// Hoisted outside stringWidth() for reuse across multiple calls.
//
// A grapheme cluster is what a user perceives as a single character, but may
// be composed of multiple Unicode code points.
//
// Why this matters:
// - '👍' (thumbs up) is 1 code point but appears as 1 character → 1 grapheme
// - '👍🏽' (thumbs up + skin tone) is 2 code points but appears as 1 character → 1 grapheme
// - '👨‍👩‍👧‍👦' (family) is 7 code points (4 people + 3 ZWJ) but appears as 1 character → 1 grapheme
// - 'é' can be 1 code point (U+00E9) OR 2 code points (e + ́) but appears as 1 character → 1 grapheme
//
// Without Intl.Segmenter, simple iteration treats each code point separately,
// leading to incorrect width calculations for complex sequences.
//
// Intl.Segmenter is available in:
// - Node.js 16.0.0+ (our minimum is 18.0.0, so always available)
// - All modern browsers
//
// Performance: Creating this once and reusing it is more efficient than
// creating a new Intl.Segmenter instance on every stringWidth() call.
const segmenter = new Intl.Segmenter()

// Feature-detect Unicode property escapes support and create regex patterns.
// Hoisted outside stringWidth() for reuse across multiple calls.
//
// The 'v' flag (ES2024, Node 20+) provides the most accurate Unicode support
// including \p{RGI_Emoji}. The 'u' flag (ES2015, Node 18+) falls back to
// \p{Extended_Pictographic} (broader, slightly less precise).
let zeroWidthClusterRegex: RegExp
let leadingNonPrintingRegex: RegExp
let emojiRegex: RegExp

try {
  // Try 'v' flag first (Node 20+) for most accurate Unicode property support.
  zeroWidthClusterRegex =
    /^(?:\p{Default_Ignorable_Code_Point}|\p{Control}|\p{Mark}|\p{Surrogate})+$/v

  leadingNonPrintingRegex =
    /^[\p{Default_Ignorable_Code_Point}\p{Control}\p{Format}\p{Mark}\p{Surrogate}]+/v

  emojiRegex = /^\p{RGI_Emoji}$/v
  /* c8 ignore start */
} catch {
  // Fall back to 'u' flag (Node 18+) — no \p{Surrogate}, broader emoji.
  zeroWidthClusterRegex =
    /^(?:\p{Default_Ignorable_Code_Point}|\p{Control}|\p{Mark})+$/u
  leadingNonPrintingRegex =
    /^[\p{Default_Ignorable_Code_Point}\p{Control}\p{Format}\p{Mark}]+/u
  emojiRegex = /^\p{Extended_Pictographic}$/u
}
/* c8 ignore stop */

/**
 * Get the visual width of a string in terminal columns.
 *
 * Calculates how many columns a string will occupy when displayed in a
 * terminal, accounting for: - ANSI escape codes (stripped before calculation) -
 * Wide characters (CJK ideographs, fullwidth forms) that take 2 columns - Emoji
 * (including complex sequences) that take 2 columns - Combining marks and
 * zero-width characters (take 0 columns) - East Asian Width properties
 * (Fullwidth, Wide, Halfwidth, Narrow, etc.)
 *
 * @example
 *   ;```ts
 *   stringWidth('hello') // 5
 *   stringWidth('⚡') // 2 (lightning bolt is wide)
 *   stringWidth('✦') // 1 (star is narrow)
 *   stringWidth('漢字') // 4 (CJK × 2 cols each)
 *   stringWidth('\x1b[31mred\x1b[0m') // 3 (ANSI stripped)
 *   stringWidth('👍🏽') // 2 (emoji + skin tone = 1 cluster)
 *   stringWidth('é') // 1 (combining accent = 0 width)
 *   ```
 *
 * @param text - The string to measure.
 *
 * @returns The visual width in terminal columns
 */
/*@__NO_SIDE_EFFECTS__*/
export function stringWidth(text: string): number {
  if (typeof text !== 'string' || !text.length) {
    return 0
  }

  // Strip ANSI escape codes first (colors, bold, italic, etc.).
  /* c8 ignore next */
  const plainText = stripAnsi(text)

  if (!plainText.length) {
    return 0
  }

  let width = 0

  // Configure East Asian Width calculation.
  // ambiguousAsWide: false - treat ambiguous-width characters as narrow.
  const eastAsianWidthOptions = { ambiguousAsWide: false }
  const eastAsianWidth = getEastAsianWidth()

  // Segment the string into grapheme clusters and calculate width for each.
  for (const { segment } of segmenter.segment(plainText)) {
    // Skip zero-width / non-printing clusters (controls, combining marks).
    if (RegExpPrototypeTest(zeroWidthClusterRegex, segment)) {
      continue
    }

    // Emoji are always rendered as double-width (2 columns) in terminals.
    // The ENTIRE grapheme cluster is 2 columns regardless of code-point
    // count.
    if (RegExpPrototypeTest(emojiRegex, segment)) {
      width += 2
      continue
    }

    // For non-emoji clusters, calculate width based on the first visible
    // character. Strip leading non-printing characters to find the base.
    const baseSegment = segment.replace(leadingNonPrintingRegex, '')
    const codePoint = StringPrototypeCodePointAt(baseSegment, 0)

    if (codePoint === undefined) {
      continue
    }

    /* c8 ignore next - External eastAsianWidth call */
    width += eastAsianWidth(codePoint, eastAsianWidthOptions)

    // Handle trailing Halfwidth and Fullwidth Forms (U+FF00-U+FFEF).
    // These are spacing characters (not combining marks) so they add
    // their own column(s) when following another character.
    if (segment.length > 1) {
      for (const char of segment.slice(1)) {
        const charCode = StringPrototypeCharCodeAt(char, 0)
        if (charCode >= 0xff_00 && charCode <= 0xff_ef) {
          const trailingCodePoint = StringPrototypeCodePointAt(char, 0)
          if (trailingCodePoint !== undefined) {
            /* c8 ignore next - External eastAsianWidth call */
            width += eastAsianWidth(trailingCodePoint, eastAsianWidthOptions)
          }
        }
      }
    }
  }

  return width
}
