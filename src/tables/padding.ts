/**
 * @fileoverview Cell padding + display-width measurement — shared
 * helpers used by both the simple and bordered table renderers.
 *
 * `displayWidth` routes through `stringWidth` so multi-cell glyphs
 * (full-width CJK, emoji, combined code points) contribute their
 * actual terminal column count rather than a naive `.length`.
 */

import { MathMax } from '../primordials/math'
import { stringWidth } from '../strings/width'

import type { ColumnAlignment } from './types'

/**
 * Calculate display width accounting for ANSI codes, CJK, and emoji.
 * Uses `stringWidth` so multi-cell glyphs (full-width CJK, emoji, combined
 * code points) contribute their actual terminal column count to padding.
 */
export function displayWidth(text: string): number {
  return stringWidth(text)
}

/**
 * Pad text to specified width with alignment.
 */
export function padText(
  text: string,
  width: number,
  align: ColumnAlignment = 'left',
): string {
  const textWidth = displayWidth(text)
  const padding = MathMax(0, width - textWidth)

  switch (align) {
    case 'right':
      return ' '.repeat(padding) + text
    case 'center': {
      const leftPad = Math.floor(padding / 2)
      const rightPad = padding - leftPad
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad)
    }
    default:
      return text + ' '.repeat(padding)
  }
}
