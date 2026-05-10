/**
 * @fileoverview Stateless helpers shared by `spinner/*` modules — the
 * `ciSpinner` constant for non-interactive output, the `COLOR_INHERIT`
 * sentinel for shimmer color references, plus pure formatters
 * (`desc`, `formatProgress`, `normalizeText`, `renderProgressBar`)
 * used by both the factory and the `withSpinner*` wrappers.
 */

import colors from '../external/yoctocolors-cjs'

import { MathMax, MathRound } from '../primordials/math'
import type { ProgressInfo, SpinnerStyle } from './types'

/**
 * Sentinel value indicating the shimmer should track the spinner's
 * current color rather than holding its own palette reference.
 */
export const COLOR_INHERIT = 'inherit'

/**
 * Minimal spinner style for CI environments.
 * Uses empty frame and max interval to effectively disable animation in CI.
 */
export const ciSpinner: SpinnerStyle = {
  frames: [''],
  interval: 2_147_483_647,
}

/**
 * Create a property descriptor for defining non-enumerable properties.
 * Used for adding aliased methods to the Spinner prototype.
 * @param value - Value for the property
 * @returns Property descriptor object
 */
export function desc(value: unknown) {
  return {
    __proto__: null,
    configurable: true,
    value,
    writable: true,
  }
}

/**
 * Format progress information as a visual progress bar with percentage and count.
 * @param progress - Progress tracking information
 * @returns Formatted string with colored progress bar, percentage, and count
 * @example "███████░░░░░░░░░░░░░ 35% (7/20 files)"
 */
export function formatProgress(progress: ProgressInfo): string {
  const { current, total, unit } = progress
  // total===0 fires only when caller starts a 0-of-0 progress.
  /* c8 ignore next */
  const percentage = total === 0 ? 0 : MathRound((current / total) * 100)
  const bar = renderProgressBar(percentage)
  // unit defaults to undefined; both arms exercised when caller omits unit.
  /* c8 ignore next */
  const count = unit ? `${current}/${total} ${unit}` : `${current}/${total}`
  return `${bar} ${percentage}% (${count})`
}

/**
 * Normalize text input by trimming leading whitespace.
 * Non-string values are converted to empty string.
 * @param value - Text to normalize
 * @returns Normalized string with leading whitespace removed
 */
export function normalizeText(value: unknown) {
  // Empty-string fallback fires only on non-string inputs.
  /* c8 ignore next */
  return typeof value === 'string' ? value.trimStart() : ''
}

/**
 * Render a progress bar using block characters (█ for filled, ░ for empty).
 * @param percentage - Progress percentage (0-100)
 * @param width - Total width of progress bar in characters
 * @returns Colored progress bar string
 * @default width=20
 */
export function renderProgressBar(
  percentage: number,
  width: number = 20,
): string {
  const filled = MathMax(
    0,
    Math.min(width, Math.round((percentage / 100) * width)),
  )
  const empty = MathMax(0, width - filled)
  const bar = '█'.repeat(filled) + '░'.repeat(empty)
  // Use cyan color for the progress bar
  // colors is imported at the top
  return colors.cyan(bar)
}
