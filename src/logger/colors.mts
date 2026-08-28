/**
 * @file Color application helpers for `logger/*` modules. Wraps the vendored
 *   `yoctocolors-cjs` palette so the logger can accept either a named color
 *   (`'green'`) or an explicit RGB tuple (`[255, 0, 0]`); RGB tuples are
 *   emitted via the 24-bit `[38;2;...m` escape because `yoctocolors-cjs`
 *   doesn't ship an `rgb()` helper. Every escape is gated on what the target
 *   stream accepts, resolved by `term/colors/support`, so a run with stdout
 *   piped to a file and stderr on a terminal colors only the terminal half.
 *   The vendored palette re-exports from the
 *   external-pack mega-bundle, whose module top-level evaluates every packed
 *   package — so it is required lazily on first color application (Logger
 *   construction at the earliest), keeping `logger/*` importers
 *   browser-load-safe and cheap at module init.
 */

import type yoctocolorsCjs from '../external/yoctocolors-cjs.js'

import { getColorCapability } from '../term/colors/support.mjs'

import type { ColorStreamLike } from '../term/colors/support.mjs'
import type { ColorValue } from '../term/colors/types.mjs'

let cachedYoctocolors: typeof yoctocolorsCjs | undefined

/**
 * Where colored text is headed, so the escape can be withheld from a
 * destination that does not accept it.
 */
export interface ApplyColorConfig {
  /**
   * Stream the text is written to. Defaults to `process.stderr`, which is where
   * the logger's semantic methods and the spinner write.
   */
  stream?: ColorStreamLike | undefined
}

/**
 * Apply a color to text, or return it unchanged when the destination accepts no
 * color.
 *
 * Handles named colors and RGB tuples. The palette a stream accepts decides
 * which of the two can be honored: an RGB tuple is 24-bit truecolor, so a
 * stream without truecolor gets plain text rather than an escape it cannot
 * render.
 *
 * @example
 *   ;```typescript
 *   applyColor('ok', 'green', { stream: process.stdout })
 *   ```
 *
 * @param text - Text to color.
 * @param color - Named color or RGB tuple.
 * @param config - Destination inputs.
 *
 * @returns The colored text, or `text` unchanged when color is not accepted.
 */
export function applyColor(
  text: string,
  color: ColorValue,
  config?: ApplyColorConfig | undefined,
): string {
  const { stream } = { __proto__: null, ...config } as ApplyColorConfig
  const capability = getColorCapability({ stream: stream ?? process.stderr })
  if (typeof color === 'string') {
    if (!capability.hasBasic) {
      return text
    }
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
  if (!capability.has16m) {
    return text
  }
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
