/**
 * @fileoverview SVG keyframe batcher for the shimmer engine.
 *
 * Pre-renders N frames of the engine and emits per-character keyTimes /
 * values arrays suitable for SVG SMIL `<animate>` elements. The output is
 * deduplicated (consecutive identical colors collapse to a single
 * keyframe) and closed with a `t=1` anchor so the animation loops cleanly.
 *
 * Use with `calcMode="discrete"` to reproduce the engine's output exactly
 * — no SMIL interpolation between frames, each frame holds until the
 * next changes.
 *
 * @example
 * ```ts
 * import { configToSpec } from '@socketsecurity/lib/effects/shimmer'
 * import { toShimmerKeyframes } from '@socketsecurity/lib/effects/shimmer-keyframes'
 * const spec = configToSpec({ color: RAINBOW_GRADIENT, dir: 'ltr' }, 10)
 * const tracks = toShimmerKeyframes(spec, 10, 60)
 * // Emit one <animate> per char in your SVG:
 * //   <animate attributeName="fill" calcMode="discrete"
 * //            keyTimes={tracks[i].times.join(';')}
 * //            values={tracks[i].values.join(';')}
 * //            dur="3s" repeatCount="indefinite" />
 * ```
 */

import { frameColors, type ShimmerSpec } from './shimmer'

// === Types ===

/**
 * Keyframe track for a single character. `times[i]` is in [0, 1] and
 * pairs with `values[i]` (an `rgb(R,G,B)` string). Use directly as SMIL
 * `<animate>` attributes:
 *
 * ```jsx
 * <animate
 *   keyTimes={track.times.join(';')}
 *   values={track.values.join(';')}
 *   calcMode="discrete"
 * />
 * ```
 */
export type Keyframes = {
  /** Normalized timestamps in [0, 1], monotonically non-decreasing. */
  readonly times: readonly number[]
  /** `rgb(R,G,B)` color strings, paired by index with `times`. */
  readonly values: readonly string[]
}

// === API ===

/**
 * Render N frames of a shimmer spec into per-character keyframe tracks.
 *
 * Output is one {@link Keyframes} object per char. Consecutive identical
 * colors collapse — only the first occurrence emits a keyframe, the rest
 * are implicit (SMIL holds the previous value). A final keyframe at `t=1`
 * closes the loop with the same value as `t=0` so playback wraps cleanly.
 *
 * Use with `calcMode="discrete"` to reproduce the engine's per-frame
 * output exactly (no SMIL interpolation between frames).
 *
 * @param spec functional shimmer specification
 * @param textLength number of chars to colorize
 * @param frames total frame count to bake into the loop
 * @returns one Keyframes track per char index, in order
 */
export function toShimmerKeyframes(
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
