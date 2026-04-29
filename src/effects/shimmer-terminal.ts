/**
 * @fileoverview Terminal renderer for the shimmer engine.
 * Emits 24-bit truecolor ANSI escape sequences.
 */

import { frameColors, type RGB, type ShimmerSpec } from './shimmer'

const RESET = '\x1b[0m'

/**
 * Apply a per-char color array to a string, emitting 24-bit truecolor ANSI
 * escapes around each character.
 *
 * Caller is responsible for grapheme segmentation if needed — this function
 * iterates code units via spread, which handles BMP correctly and treats
 * surrogate pairs as a single "char". For complex graphemes (combining
 * marks, ZWJ sequences), pre-split with `Intl.Segmenter`.
 *
 * If `colors.length` differs from char count, extra chars are emitted with
 * no color (uncolored tail).
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
    out += `\x1b[38;2;${c[0]};${c[1]};${c[2]}m${chars[i]}${RESET}`
  }
  return out
}

/**
 * Render a single shimmer frame to ANSI. Convenience wrapper around
 * `frameColors` + `colorsToAnsi` for callers that don't need to inspect
 * the intermediate color array.
 */
export function renderFrame(
  spec: ShimmerSpec,
  text: string,
  frame: number,
): string {
  const chars = [...text]
  return colorsToAnsi(text, frameColors(spec, chars.length, frame))
}
