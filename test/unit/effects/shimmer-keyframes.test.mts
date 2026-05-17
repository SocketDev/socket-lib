/**
 * @fileoverview Unit tests for the shimmer keyframes adapter.
 */

import { describe, expect, it } from 'vitest'

import {
  configToSpec,
  frameColors,
  type RGB,
  type ShimmerSpec,
} from '@socketsecurity/lib/effects/shimmer'
import { toShimmerKeyframes } from '@socketsecurity/lib/effects/shimmer-keyframes'

describe('effects/shimmer-keyframes', () => {
  describe('toShimmerKeyframes', () => {
    it('produces one Keyframes track per character', () => {
      const spec = configToSpec({ color: [255, 0, 0], dir: 'ltr', speed: 1 }, 5)
      const tracks = toShimmerKeyframes(spec, 5, 30)
      expect(tracks).toHaveLength(5)
      for (const track of tracks) {
        expect(track.times.length).toBe(track.values.length)
      }
    })

    it('emits a t=1 keyframe to close the loop', () => {
      const spec = configToSpec({ color: [255, 0, 0], dir: 'ltr', speed: 1 }, 5)
      const tracks = toShimmerKeyframes(spec, 5, 20)
      for (const track of tracks) {
        expect(track.times[track.times.length - 1]).toBe(1)
        // Closing value matches the opening value (clean loop).
        expect(track.values[track.values.length - 1]).toBe(track.values[0])
      }
    })

    it('deduplicates consecutive identical colors', () => {
      // A static spec (wave never moves) should produce just two keyframes
      // per char: the initial value and the t=1 closure.
      const spec: ShimmerSpec = {
        positionAt: () => -100,
        kernel: () => [10, 20, 30] as RGB,
        baseColor: () => [10, 20, 30],
        highlightColor: () => [10, 20, 30],
      }
      const tracks = toShimmerKeyframes(spec, 3, 50)
      for (const track of tracks) {
        expect(track.values).toHaveLength(2)
        expect(track.values[0]).toBe('rgb(10,20,30)')
        expect(track.values[1]).toBe('rgb(10,20,30)')
      }
    })

    it('emits values in rgb(r,g,b) format', () => {
      const spec = configToSpec({ color: [255, 100, 50], dir: 'none' }, 3)
      const tracks = toShimmerKeyframes(spec, 3, 5)
      for (const track of tracks) {
        for (const v of track.values) {
          expect(v).toMatch(/^rgb\(\d+,\d+,\d+\)$/)
        }
      }
    })

    it('keyTimes are monotonically non-decreasing in [0, 1]', () => {
      const spec = configToSpec({ color: [255, 0, 0], dir: 'ltr', speed: 1 }, 8)
      const tracks = toShimmerKeyframes(spec, 8, 40)
      for (const track of tracks) {
        for (let i = 1; i < track.times.length; i++) {
          expect(track.times[i]!).toBeGreaterThanOrEqual(track.times[i - 1]!)
        }
        expect(track.times[0]).toBeGreaterThanOrEqual(0)
        expect(track.times[track.times.length - 1]).toBeLessThanOrEqual(1)
      }
    })

    it('handles 0 frames gracefully (only t=1 closure)', () => {
      const spec = configToSpec({ color: [255, 0, 0], dir: 'ltr', speed: 1 }, 3)
      const tracks = toShimmerKeyframes(spec, 3, 0)
      for (const track of tracks) {
        expect(track.times).toEqual([1])
        // No frames captured, so the closing value falls back to the default.
        expect(track.values).toHaveLength(1)
      }
    })

    it('agrees with frameColors at every emitted keyframe time', () => {
      // Frame-by-frame correctness: for every keyframe (time, value), there
      // must exist a frame number whose engine output matches that value.
      // This catches any drift between the keyframes adapter and the engine.
      const FRAMES = 30
      const spec = configToSpec({ color: [255, 0, 0], dir: 'bi', speed: 1 }, 6)
      const tracks = toShimmerKeyframes(spec, 6, FRAMES)

      // For each char, verify each emitted keyframe matches the engine's
      // output at the corresponding frame index.
      for (let charIdx = 0; charIdx < 6; charIdx++) {
        const track = tracks[charIdx]!
        // Skip the t=1 closure entry (it's a synthetic loop wrap).
        for (let k = 0; k < track.times.length - 1; k++) {
          const frameIdx = Math.round(track.times[k]! * FRAMES)
          const engineRgb = frameColors(spec, 6, frameIdx)[charIdx]!
          const engineStr = `rgb(${engineRgb[0]},${engineRgb[1]},${engineRgb[2]})`
          expect(track.values[k]).toBe(engineStr)
        }
      }
    })

    it('omits redundant keyframes when consecutive frames are identical', () => {
      // A wave that's parked off-screen produces an unchanging stream of base
      // colors. The adapter should compress that to a single keyframe.
      const spec = configToSpec({ color: [100, 200, 50], dir: 'none' }, 4)
      const tracks = toShimmerKeyframes(spec, 4, 100)
      // 'none' direction → wave never on text → all 100 frames identical.
      // Tracks should compress to: opening keyframe + t=1 closure = 2 entries.
      for (const track of tracks) {
        expect(track.values).toHaveLength(2)
      }
    })
  })
})
