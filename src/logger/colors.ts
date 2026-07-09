/**
 * @file Color application helpers for `logger/*` modules. Wraps the vendored
 *   `yoctocolors-cjs` palette so the logger can accept either a named color
 *   (`'green'`) or an explicit RGB tuple (`[255, 0, 0]`); RGB tuples are
 *   emitted via the 24-bit `[38;2;...m` escape because `yoctocolors-cjs`
 *   doesn't ship an `rgb()` helper. The vendored palette re-exports from the
 *   external-pack mega-bundle, whose module top-level evaluates every packed
 *   package — so it is required lazily on first color application (Logger
 *   construction at the earliest), keeping `logger/*` importers
 *   browser-load-safe and cheap at module init.
 */

import type yoctocolorsCjs from '../external/yoctocolors-cjs'

import type { ColorValue } from '../colors/types'

let cachedYoctocolors: typeof yoctocolorsCjs | undefined

/**
 * Apply a color to text using yoctocolors. Handles both named colors and RGB
 * tuples.
 */
export function applyColor(text: string, color: ColorValue): string {
  if (typeof color === 'string') {
    // Named color like 'green', 'red', etc. The yoctocolors palette indexes to
    // a (text: string) => string formatter for each named color.
    const formatter = (
      getYoctocolors() as unknown as Record<
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
 * Get the yoctocolors module for terminal colors. Required lazily on first
 * call — see the @file note on the external-pack top-level.
 */
export function getYoctocolors(): typeof yoctocolorsCjs {
  if (cachedYoctocolors === undefined) {
    cachedYoctocolors =
      require('../external/yoctocolors-cjs') as typeof yoctocolorsCjs
  }
  return cachedYoctocolors
}
