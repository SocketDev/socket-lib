/**
 * @fileoverview Terminal renderer for the shimmer engine.
 *
 * Turns the engine's `RGB[]` output into a single ANSI-escaped string ready
 * to write to stdout/stderr. Uses 24-bit truecolor escape sequences
 * (`\x1b[38;2;R;G;Bm`) which most modern terminals (iTerm2, Terminal.app,
 * Windows Terminal, Alacritty, Ghostty, kitty, gnome-terminal) support
 * natively. Terminals that lack truecolor (basic `xterm`, some serial
 * consoles) will display the raw escape codes — call sites that need to
 * support those terminals should fall back to {@link colorsToAnsi}'s
 * "no colors" path or skip rendering entirely.
 *
 * The high-level {@link renderFrame} convenience runs the full pipeline
 * (engine → ANSI) in one call. {@link colorsToAnsi} is the lower-level
 * helper for when you already have an `RGB[]` from {@link frameColors}.
 *
 * @example
 * ```ts
 * import { configToSpec } from '@socketsecurity/lib/effects/shimmer'
 * import { renderFrame } from '@socketsecurity/lib/effects/shimmer-terminal'
 * const spec = configToSpec({ color: [140, 82, 255], dir: 'ltr' }, 'Loading'.length)
 * process.stdout.write(renderFrame(spec, 'Loading', frame))
 * ```
 */

import { ANSI_RESET } from '../ansi'
import { frameColors, type RGB, type ShimmerSpec } from './shimmer'

/**
 * ANSI "reset all attributes" sequence. Re-exported from `../ansi` for
 * convenience so callers don't need a separate import for the canonical
 * value. Identical to `ANSI_RESET` in `@socketsecurity/lib/ansi`.
 */
export { ANSI_RESET }

// === API ===

/**
 * Build the 24-bit truecolor foreground escape for an RGB tuple. Returns
 * `\x1b[38;2;R;G;Bm`. Exported so callers building ANSI by hand can use
 * the same helper.
 */
export function ansiTruecolor([r, g, b]: RGB): string {
  return `\x1b[38;2;${r};${g};${b}m`
}

/**
 * Wrap each char of `text` in a 24-bit truecolor ANSI escape using the
 * matching color from `colors`. Each char is followed by an ANSI reset so
 * adjacent uncolored output isn't tinted.
 *
 * Caller is responsible for grapheme segmentation if the text contains
 * complex graphemes (combining marks, ZWJ sequences). This function uses
 * spread iteration which handles BMP code points and surrogate pairs but
 * treats each grapheme cluster as multiple "chars."
 *
 * If `colors.length` is shorter than the text's char count, surplus chars
 * are emitted without color (uncolored tail).
 *
 * @param text input string to color
 * @param colors per-char colors; index `i` colors char `i`
 * @returns ANSI-escaped string
 */
export function colorsToAnsi(text: string, colors: readonly RGB[]): string {
  const chars = [...text]
  let out = ''
  for (let i = 0; i < chars.length; i++) {
    const c = colors[i]
    if (c === undefined) {
      out += chars[i]
      continue
    }
    out += `${ansiTruecolor(c)}${chars[i]}${ANSI_RESET}`
  }
  return out
}

/**
 * Render a single shimmer frame as ANSI-escaped text. Convenience wrapper
 * over {@link frameColors} + {@link colorsToAnsi} for callers that don't
 * need the intermediate `RGB[]`.
 *
 * @param spec functional shimmer specification (see {@link ShimmerSpec})
 * @param text the string to colorize
 * @param frame caller-controlled frame counter
 */
export function renderFrame(
  spec: ShimmerSpec,
  text: string,
  frame: number,
): string {
  const chars = [...text]
  return colorsToAnsi(text, frameColors(spec, chars.length, frame))
}
