/**
 * @fileoverview Unit tests for the shimmer terminal adapter.
 */

import { describe, expect, it } from 'vitest'

import {
  blockKernel,
  configToSpec,
  constant,
  type RGB,
  type ShimmerSpec,
} from '@socketsecurity/lib/effects/shimmer'
import {
  colorsToAnsi,
  renderFrame,
} from '@socketsecurity/lib/effects/shimmer-terminal'

const RED: RGB = [255, 0, 0]
const GREEN: RGB = [0, 255, 0]
const BLUE: RGB = [0, 0, 255]
const WHITE: RGB = [255, 255, 255]

describe('effects/shimmer-terminal', () => {
  describe('colorsToAnsi', () => {
    it('wraps each char in 24-bit truecolor escape + reset', () => {
      const result = colorsToAnsi('ab', [RED, BLUE])
      expect(result).toBe(
        '\x1b[38;2;255;0;0ma\x1b[0m\x1b[38;2;0;0;255mb\x1b[0m',
      )
    })

    it('emits an empty string for empty input', () => {
      expect(colorsToAnsi('', [])).toBe('')
    })

    it('passes uncolored chars through when colors is shorter than text', () => {
      const result = colorsToAnsi('abc', [RED])
      // 'a' wrapped with red, 'b' and 'c' uncolored.
      expect(result).toBe('\x1b[38;2;255;0;0ma\x1b[0mbc')
    })

    it('handles surrogate pairs as single characters via spread iteration', () => {
      const result = colorsToAnsi('🎉', [RED])
      expect(result).toContain('🎉')
    })
  })

  describe('renderFrame', () => {
    it('renders a frame end-to-end via the engine', () => {
      const spec: ShimmerSpec = {
        positionAt: () => -100, // wave off-screen, so all chars are base color
        kernel: blockKernel(1),
        baseColor: constant(GREEN),
        highlightColor: constant(WHITE),
      }
      const result = renderFrame(spec, 'hi', 0)
      expect(result).toBe(
        '\x1b[38;2;0;255;0mh\x1b[0m\x1b[38;2;0;255;0mi\x1b[0m',
      )
    })

    it('produces different output for different frames when wave is active', () => {
      const spec = configToSpec({ color: RED, dir: 'ltr', speed: 1 }, 10)
      const a = renderFrame(spec, 'abcdefghij', 0)
      const b = renderFrame(spec, 'abcdefghij', 5)
      expect(a).not.toBe(b)
    })
  })
})
