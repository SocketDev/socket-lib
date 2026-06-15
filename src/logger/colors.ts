/**
 * @file Color application helpers for `logger/*` modules. Wraps the vendored
 *   `yoctocolors-cjs` palette so the logger can accept either a named color
 *   (`'green'`) or an explicit RGB tuple (`[255, 0, 0]`); RGB tuples are
 *   emitted via the 24-bit `[38;2;...m` escape because `yoctocolors-cjs`
 *   doesn't ship an `rgb()` helper.
 */

import yoctocolorsCjs from '../external/yoctocolors-cjs'

import type { ColorValue } from '../colors/types'

/**
 * Apply a color to text using yoctocolors. Handles both named colors and RGB
 * tuples.
 */
export function applyColor(text: string, color: ColorValue): string {
  if (typeof color === 'string') {
    // Named color like 'green', 'red', etc. The yoctocolors palette indexes to
    // a (text: string) => string formatter for each named color.
    const formatter = (
      yoctocolorsCjs as unknown as Record<
        string,
        ((text: string) => string) | undefined
      >
    )[color]
    return formatter ? formatter(text) : text
  }
  // RGB tuple [r, g, b] - manually construct ANSI escape codes.
  // yoctocolors-cjs doesn't have an rgb() method, so we build it ourselves.
  const { 0: r, 1: g, 2: b } = color
  return `\u001B[38;2;${r};${g};${b}m${text}\u001B[39m`
}

/**
 * Get the yoctocolors module for terminal colors.
 */
export function getYoctocolors() {
  return yoctocolorsCjs
}
