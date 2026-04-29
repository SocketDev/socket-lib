/**
 * @fileoverview Unit tests for the shimmer terminal adapter.
 *
 * Covers every public export of `effects/shimmer-terminal`:
 *   - colorsToAnsi(): per-char ANSI truecolor wrapping
 *   - renderFrame(): one-call engine + wrapping
 *   - ansiTruecolor(): single-RGB → escape-string helper
 *   - ANSI_RESET re-export from `ansi`
 *
 * Surrogate-pair handling is exercised; full grapheme cluster handling is
 * caller responsibility (documented).
 */

import { describe, expect, it } from 'vitest'

import { ANSI_RESET as CANONICAL_ANSI_RESET } from '@socketsecurity/lib/ansi'
import {
  blockKernel,
  configToSpec,
  solidColor,
  type RGB,
  type ShimmerSpec,
} from '@socketsecurity/lib/effects/shimmer'
import {
  ANSI_RESET,
  ansiTruecolor,
  colorsToAnsi,
  renderFrame,
} from '@socketsecurity/lib/effects/shimmer-terminal'

const RED: RGB = [255, 0, 0]
const GREEN: RGB = [0, 255, 0]
const BLUE: RGB = [0, 0, 255]
const WHITE: RGB = [255, 255, 255]

describe('effects/shimmer-terminal', () => {
  describe('ANSI_RESET', () => {
    it('exposes the standard ANSI reset sequence', () => {
      expect(ANSI_RESET).toBe('\x1b[0m')
    })

    it('matches the canonical ANSI_RESET from ansi.ts', () => {
      // shimmer-terminal re-exports the canonical constant; it must not
      // drift from the one in src/ansi.ts.
      expect(ANSI_RESET).toBe(CANONICAL_ANSI_RESET)
    })
  })

  describe('ansiTruecolor', () => {
    it('builds a 24-bit foreground escape from an RGB tuple', () => {
      expect(ansiTruecolor([255, 0, 0])).toBe('\x1b[38;2;255;0;0m')
    })

    it('handles arbitrary channels in 0-255 range', () => {
      expect(ansiTruecolor([140, 82, 255])).toBe('\x1b[38;2;140;82;255m')
      expect(ansiTruecolor([0, 0, 0])).toBe('\x1b[38;2;0;0;0m')
      expect(ansiTruecolor([255, 255, 255])).toBe('\x1b[38;2;255;255;255m')
    })

    it('serializes channels in r-g-b order', () => {
      expect(ansiTruecolor([10, 20, 30])).toContain(';10;20;30m')
    })
  })

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
      expect(result).toContain('\x1b[38;2;255;0;0m')
      expect(result).toContain('\x1b[0m')
    })

    it('emits ANSI_RESET after every colored char', () => {
      const result = colorsToAnsi('abc', [RED, GREEN, BLUE])
      // 3 colored chars → 3 reset sequences.
      const resets = result.match(/\x1b\[0m/g) ?? []
      expect(resets).toHaveLength(3)
    })

    it('handles a single character', () => {
      expect(colorsToAnsi('x', [BLUE])).toBe('\x1b[38;2;0;0;255mx\x1b[0m')
    })

    it('uses ansiTruecolor for the escape prefix', () => {
      const result = colorsToAnsi('a', [RED])
      expect(result).toContain(ansiTruecolor(RED))
    })
  })

  describe('renderFrame', () => {
    it('renders a frame end-to-end via the engine', () => {
      const spec: ShimmerSpec = {
        positionAt: () => -100, // wave off-screen, so all chars are base color
        kernel: blockKernel(1),
        baseColor: solidColor(GREEN),
        highlightColor: solidColor(WHITE),
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

    it('handles empty text without throwing', () => {
      const spec = configToSpec({ color: RED, dir: 'ltr' }, 0)
      expect(renderFrame(spec, '', 0)).toBe('')
    })

    it('counts grapheme clusters via spread (text length matches engine)', () => {
      // '🎉' is a surrogate pair; spread iteration gives length 1.
      // The engine should be called with textLength=1.
      const spec: ShimmerSpec = {
        positionAt: () => 0,
        kernel: blockKernel(1),
        baseColor: solidColor(RED),
        highlightColor: solidColor(WHITE),
      }
      const result = renderFrame(spec, '🎉', 0)
      // Exactly one colored char (one ANSI prefix + one reset).
      expect(result.match(/\x1b\[38;2;/g)).toHaveLength(1)
    })
  })
})
