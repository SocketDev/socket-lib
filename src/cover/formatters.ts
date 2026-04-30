/**
 * @fileoverview Coverage output formatters.
 */

import { indentString } from '../strings'

import type { FormatCoverageOptions } from './types'

import {
  JSONStringify,
  NumberIsNaN,
  NumberParseFloat,
  NumberPrototypeToFixed,
} from '../primordials'

/**
 * Coverage emoji thresholds for visual feedback.
 */
const COVERAGE_EMOJI_THRESHOLDS = [
  { emoji: ' 🚀', threshold: 99 },
  { emoji: ' 🎯', threshold: 95 },
  { emoji: ' ✨', threshold: 90 },
  { emoji: ' 💚', threshold: 85 },
  { emoji: ' ✅', threshold: 80 },
  { emoji: ' 🟢', threshold: 70 },
  { emoji: ' 🟡', threshold: 60 },
  { emoji: ' 🔨', threshold: 50 },
  { emoji: ' ⚠️', threshold: 0 },
]

/**
 * Calculate overall coverage percentage.
 */
function calculateOverall(
  code: FormatCoverageOptions['code'],
  type: FormatCoverageOptions['type'],
): string {
  const metrics = [
    NumberParseFloat(code.statements.percent),
    NumberParseFloat(code.branches.percent),
    NumberParseFloat(code.functions.percent),
    NumberParseFloat(code.lines.percent),
  ].map(val => (NumberIsNaN(val) ? 0 : val))

  if (type) {
    const typePercent = NumberParseFloat(type.percent)
    metrics.push(NumberIsNaN(typePercent) ? 0 : typePercent)
  }

  const average = metrics.reduce((sum, val) => sum + val, 0) / metrics.length
  return NumberPrototypeToFixed(average, 2)
}

/**
 * Format coverage data for console output.
 *
 * @example
 * ```typescript
 * const output = formatCoverage({
 *   code: {
 *     statements: { percent: '85.00' },
 *     branches: { percent: '80.00' },
 *     functions: { percent: '90.00' },
 *     lines: { percent: '88.00' },
 *   },
 * })
 * ```
 */
export function formatCoverage(options: FormatCoverageOptions): string {
  const opts = {
    __proto__: null,
    format: 'default' as const,
    ...options,
  } as Required<FormatCoverageOptions>

  const { code, format, type } = opts

  if (format === 'json') {
    return JSONStringify({ code, type }, null, 2)
  }

  const overall = calculateOverall(code, type)

  if (format === 'simple') {
    return overall
  }

  // Default format with emoji and details.
  let output = ''

  // Code coverage section.
  output += 'Code Coverage:\n'
  output += indentString(`Statements: ${code.statements.percent}%\n`, {
    count: 2,
  })
  output += indentString(`Branches: ${code.branches.percent}%\n`, { count: 2 })
  output += indentString(`Functions: ${code.functions.percent}%\n`, {
    count: 2,
  })
  output += indentString(`Lines: ${code.lines.percent}%\n`, { count: 2 })

  // Type coverage section.
  if (type) {
    output += '\nType Coverage:\n'
    output += indentString(
      `${type.percent}% (${type.covered}/${type.total})\n`,
      { count: 2 },
    )
  }

  // Overall.
  const overallValue = NumberParseFloat(overall)
  const emoji = getCoverageEmoji(NumberIsNaN(overallValue) ? 0 : overallValue)
  output += `\nOverall: ${overall}%${emoji}\n`

  return output
}

/**
 * Get emoji for coverage percentage.
 *
 * @example
 * ```typescript
 * getCoverageEmoji(95)  // ' \u{1F3AF}'
 * getCoverageEmoji(50)  // ' \u{1F528}'
 * ```
 */
export function getCoverageEmoji(percent: number): string {
  const entry = COVERAGE_EMOJI_THRESHOLDS.find(
    ({ threshold }) => percent >= threshold,
  )
  return entry?.emoji || ''
}
