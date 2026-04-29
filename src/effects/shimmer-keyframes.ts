/**
 * @fileoverview SVG keyframe generator for the shimmer engine.
 *
 * Batches N frames of shimmer into per-character keyTimes/values arrays
 * suitable for SMIL `<animate>` elements. Deduplicates consecutive
 * identical colors so the SVG only encodes color *changes*, not every
 * frame's redundant value.
 */

import { frameColors, type ShimmerSpec } from './shimmer'

/**
 * Per-character animation track. `times[i]` is in [0, 1] and pairs with
 * `values[i]` (an `rgb(R,G,B)` string). Use directly as SMIL attributes:
 * `<animate keyTimes={times.join(';')} values={values.join(';')} />`.
 */
export type Keyframes = {
  readonly times: readonly number[]
  readonly values: readonly string[]
}

/**
 * Render N frames of a shimmer spec into per-character keyframe tracks.
 *
 * Output is one `Keyframes` object per character. Consecutive identical
 * colors collapse — only the first occurrence emits a keyframe, the rest
 * are implicit (SMIL holds the previous value). A final keyframe at t=1
 * closes the loop with the same value as t=0 so playback wraps cleanly.
 *
 * Use with `calcMode="discrete"` to reproduce the engine's per-frame
 * output exactly (no SMIL interpolation between frames).
 *
 * @param spec functional shimmer specification.
 * @param textLength number of characters.
 * @param frames total frame count to bake into the loop.
 * @returns one Keyframes object per character index.
 */
export function toKeyframes(
  spec: ShimmerSpec,
  textLength: number,
  frames: number,
): Keyframes[] {
  const tracks: Array<{ times: number[]; values: string[] }> = []
  for (let i = 0; i < textLength; i++) {
    tracks.push({ times: [], values: [] })
  }

  for (let f = 0; f < frames; f++) {
    const t = f / frames
    const colors = frameColors(spec, textLength, f)
    for (let i = 0; i < textLength; i++) {
      const c = colors[i]!
      const v = `rgb(${c[0]},${c[1]},${c[2]})`
      const track = tracks[i]!
      if (track.values[track.values.length - 1] !== v) {
        track.times.push(t)
        track.values.push(v)
      }
    }
  }

  // Anchor t=1 to the same value as frame 0 so the loop wraps without a
  // visible glitch at the seam.
  for (let i = 0; i < textLength; i++) {
    const track = tracks[i]!
    track.times.push(1)
    track.values.push(track.values[0] ?? 'rgb(0,0,0)')
  }

  return tracks
}
