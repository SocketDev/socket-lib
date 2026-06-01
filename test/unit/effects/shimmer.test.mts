/**
 * @file Unit tests for the shimmer engine. The engine is a pure function:
 *   (spec, length, frame) → RGB[]. These tests verify the building blocks
 *   (kernels, sweep generators, palette helpers) compose correctly and produce
 *   deterministic output.
 */

import { describe, expect, it } from 'vitest'

import {
  DEFAULT_BASE_COLOR,
  WHITE,
  frameColors,
} from '@socketsecurity/lib-stable/effects/shimmer'

import {
  blendRgb,
  blockKernel,
  configToSpec,
  gradient,
  resolvePalette,
  smoothKernel,
  solidColor,
} from '../../../src/effects/shimmer'
import type {
  Palette,
  RGB,
  ShimmerSpec,
} from '../../../src/effects/shimmer'

const RED: RGB = [255, 0, 0]
const GREEN: RGB = [0, 255, 0]
const BLUE: RGB = [0, 0, 255]

describe('effects/shimmer', () => {
  describe('blendRgb', () => {
    it('returns a at t=0 and b at t=1', () => {
      expect(blendRgb(RED, BLUE, 0)).toEqual(RED)
      expect(blendRgb(RED, BLUE, 1)).toEqual(BLUE)
    })

    it('interpolates linearly per channel at t=0.5', () => {
      expect(blendRgb(RED, BLUE, 0.5)).toEqual([128, 0, 128])
    })

    it('clamps t to [0, 1]', () => {
      expect(blendRgb(RED, BLUE, -1)).toEqual(RED)
      expect(blendRgb(RED, BLUE, 2)).toEqual(BLUE)
    })

    it('rounds RGB channels to integer', () => {
      const result = blendRgb([0, 0, 0], [255, 255, 255], 0.333)
      expect(result.every(c => Number.isInteger(c))).toBe(true)
    })
  })

  describe('solidColor', () => {
    it('returns the same color regardless of index', () => {
      const f = solidColor(RED)
      expect(f(0)).toEqual(RED)
      expect(f(99)).toEqual(RED)
    })

    it('returns the same reference for repeat calls', () => {
      const f = solidColor(RED)
      expect(f(0)).toBe(f(1))
    })
  })

  describe('exported constants', () => {
    it('WHITE is rgb(255, 255, 255)', () => {
      expect(WHITE).toEqual([255, 255, 255])
    })

    it('DEFAULT_BASE_COLOR is Socket purple', () => {
      expect(DEFAULT_BASE_COLOR).toEqual([140, 82, 255])
    })

    it('configToSpec uses DEFAULT_BASE_COLOR when color omitted', () => {
      const spec = configToSpec({ dir: 'none' }, 3)
      const colors = frameColors(spec, 3, 0)
      // dir='none' → wave never on text → every char shows base color.
      expect(colors[0]).toEqual(DEFAULT_BASE_COLOR)
      expect(colors[1]).toEqual(DEFAULT_BASE_COLOR)
      expect(colors[2]).toEqual(DEFAULT_BASE_COLOR)
    })

    it('configToSpec uses WHITE highlight by default', () => {
      const spec = configToSpec(
        {
          color: [0, 0, 0] as RGB,
          dir: 'ltr',
          speed: 1,
          kernel: 'block',
          padding: 0,
        },
        3,
      )
      // padding=0: wave starts at char 0. block kernel: char 0 is highlight.
      const colors = frameColors(spec, 3, 0)
      expect(colors[0]).toEqual(WHITE)
    })
  })

  describe('gradient', () => {
    it('cycles through palette via i % length', () => {
      const palette: Palette = [RED, GREEN, BLUE]
      const f = gradient(palette)
      expect(f(0)).toEqual(RED)
      expect(f(1)).toEqual(GREEN)
      expect(f(2)).toEqual(BLUE)
      expect(f(3)).toEqual(RED)
      expect(f(4)).toEqual(GREEN)
    })

    it('throws on empty palette', () => {
      expect(() => gradient([])).toThrow()
    })
  })

  describe('blockKernel', () => {
    it('returns highlight when |distance| ≤ halfWidth, base otherwise', () => {
      const k = blockKernel(1)
      const ctx = { baseColor: RED, highlightColor: WHITE }
      expect(k(0, ctx)).toEqual(WHITE)
      expect(k(0.5, ctx)).toEqual(WHITE)
      expect(k(-1, ctx)).toEqual(WHITE)
      expect(k(1, ctx)).toEqual(WHITE)
      expect(k(1.01, ctx)).toEqual(RED)
      expect(k(-2, ctx)).toEqual(RED)
    })

    it('defaults halfWidth to 1 (3-char highlight)', () => {
      const k = blockKernel()
      const ctx = { baseColor: RED, highlightColor: WHITE }
      expect(k(0, ctx)).toEqual(WHITE)
      expect(k(1, ctx)).toEqual(WHITE)
      expect(k(2, ctx)).toEqual(RED)
    })
  })

  describe('smoothKernel', () => {
    it('returns base color outside halfWidth', () => {
      const k = smoothKernel(2.5)
      const ctx = { baseColor: RED, highlightColor: WHITE }
      expect(k(2.5, ctx)).toEqual(RED)
      expect(k(-3, ctx)).toEqual(RED)
    })

    it('returns highlight color at distance 0', () => {
      const k = smoothKernel(2.5)
      expect(k(0, { baseColor: RED, highlightColor: WHITE })).toEqual(WHITE)
    })

    it('blends symmetrically (positive and negative distance)', () => {
      const k = smoothKernel(2.5)
      const ctx = { baseColor: RED, highlightColor: WHITE }
      expect(k(1, ctx)).toEqual(k(-1, ctx))
      expect(k(2, ctx)).toEqual(k(-2, ctx))
    })

    it('intensity decreases with distance', () => {
      const k = smoothKernel(2.5)
      const ctx = { baseColor: [0, 0, 0] as RGB, highlightColor: WHITE }
      const at0 = k(0, ctx)[0]
      const at1 = k(1, ctx)[0]
      const at2 = k(2, ctx)[0]
      expect(at0).toBeGreaterThan(at1)
      expect(at1).toBeGreaterThan(at2)
    })
  })

  describe('configToSpec', () => {
    it('produces a working spec from a flat config', () => {
      const spec = configToSpec({ color: RED, dir: 'ltr', speed: 1 }, 10)
      // At frame 0 with speed=1, wave is at the LTR start.
      const colors = frameColors(spec, 10, 0)
      expect(colors).toHaveLength(10)
      // Every color should be either RED or a blend toward white.
      for (const c of colors) {
        expect(c[0]).toBeGreaterThanOrEqual(255 - 1)
        expect(c[0]).toBeLessThanOrEqual(255)
      }
    })

    it('applies speed (frame * speed = engine step)', () => {
      const slow = configToSpec({ color: RED, dir: 'ltr', speed: 0.5 }, 10)
      const fast = configToSpec({ color: RED, dir: 'ltr', speed: 1 }, 10)
      // After 4 frames: slow wave at step 2, fast wave at step 4 — different positions.
      const slowAt4 = frameColors(slow, 10, 4)
      const fastAt4 = frameColors(fast, 10, 4)
      // The colors at indices around the wave will differ between slow/fast.
      expect(JSON.stringify(slowAt4)).not.toBe(JSON.stringify(fastAt4))
    })

    it('honors kernel choice (block vs smooth)', () => {
      const block = configToSpec(
        { color: RED, dir: 'ltr', speed: 1, kernel: 'block' },
        10,
      )
      const smooth = configToSpec(
        { color: RED, dir: 'ltr', speed: 1, kernel: 'smooth' },
        10,
      )
      // Block kernel: every char is either pure RED or pure WHITE.
      const blockColors = frameColors(block, 10, 3)
      for (const c of blockColors) {
        const isRed = c[0] === 255 && c[1] === 0 && c[2] === 0
        const isWhite = c[0] === 255 && c[1] === 255 && c[2] === 255
        expect(isRed || isWhite).toBe(true)
      }
      // Smooth kernel: at least some colors should be intermediate (blends).
      const smoothColors = frameColors(smooth, 10, 3)
      const hasBlend = smoothColors.some(
        c => c[1] > 0 && c[1] < 255 && c[2] > 0 && c[2] < 255,
      )
      expect(hasBlend).toBe(true)
    })

    it('treats palette input as per-char colors', () => {
      const palette: Palette = [RED, GREEN, BLUE]
      const spec = configToSpec({ color: palette, dir: 'none' }, 6)
      // 'none' direction means no shimmer, so each char should be its base palette color.
      const colors = frameColors(spec, 6, 0)
      expect(colors[0]).toEqual(RED)
      expect(colors[1]).toEqual(GREEN)
      expect(colors[2]).toEqual(BLUE)
      expect(colors[3]).toEqual(RED)
    })

    it('defaults dir to ltr when omitted', () => {
      const spec = configToSpec({ color: RED, speed: 1 }, 10)
      // ltr starts the wave at -padding (default padding=2). frame 0 wave at -2.
      // Char 0 should be at distance 2 from wave → still in smooth-kernel range.
      const c0 = frameColors(spec, 10, 0)
      // At frame 6 (wave at 4), char 4 should be near-white (peak).
      const c6 = frameColors(spec, 10, 6)
      // Shapes should differ between frame 0 and frame 6.
      expect(JSON.stringify(c0)).not.toBe(JSON.stringify(c6))
    })

    it('defaults speed to 1/3 when omitted', () => {
      const slow = configToSpec({ color: RED, dir: 'ltr' }, 10)
      const explicit = configToSpec(
        { color: RED, dir: 'ltr', speed: 1 / 3 },
        10,
      )
      // Both should produce identical output at every frame.
      for (let f = 0; f < 10; f++) {
        expect(frameColors(slow, 10, f)).toEqual(frameColors(explicit, 10, f))
      }
    })

    it('honors custom highlight color', () => {
      const spec = configToSpec(
        {
          color: [0, 0, 0] as RGB,
          highlight: GREEN,
          dir: 'ltr',
          speed: 1,
          kernel: 'block',
        },
        5,
      )
      // With block kernel, chars within ±1 of wave should be GREEN, not WHITE.
      // Wave at frame 2 should be at position 0 (wave starts at -padding=-2,
      // advances by speed=1 per frame; frame 2 → wave at 0).
      const colors = frameColors(spec, 5, 2)
      // Char 0 should be GREEN (highlight on the wave center).
      expect(colors[0]).toEqual(GREEN)
    })

    it('honors padding setting (controls wave entry/exit)', () => {
      const tight = configToSpec(
        { color: RED, dir: 'ltr', speed: 1, padding: 0 },
        10,
      )
      const loose = configToSpec(
        { color: RED, dir: 'ltr', speed: 1, padding: 5 },
        10,
      )
      // tight padding=0: wave starts at frame 0 already on char 0.
      // loose padding=5: wave starts at frame 0 at char -5 (off-screen).
      // So char 0 at frame 0: tight should be highly active, loose should be at base color.
      const tightAt0 = frameColors(tight, 10, 0)
      const looseAt0 = frameColors(loose, 10, 0)
      // tight: char 0 is right at wave center → near-white.
      expect(tightAt0[0]).toEqual(WHITE)
      // loose: char 0 is far from wave → still RED base.
      expect(looseAt0[0]).toEqual(RED)
    })

    it('honors custom width on smoothKernel', () => {
      const narrow = configToSpec(
        { color: [0, 0, 0] as RGB, dir: 'ltr', speed: 1, width: 1 },
        10,
      )
      const wide = configToSpec(
        { color: [0, 0, 0] as RGB, dir: 'ltr', speed: 1, width: 4 },
        10,
      )
      // Place wave at center. Use a high frame so wave is well inside the text.
      // narrow halfWidth=1 means char 2 is OUTSIDE the bright zone (gets base color).
      // wide halfWidth=4 means char 2 is INSIDE (gets some white blend).
      const narrowColors = frameColors(narrow, 10, 4)
      const wideColors = frameColors(wide, 10, 4)
      // The wide kernel should have more chars affected (non-base).
      const isBase = (c: RGB) => c[0] === 0 && c[1] === 0 && c[2] === 0
      const narrowAffected = narrowColors.filter(c => !isBase(c)).length
      const wideAffected = wideColors.filter(c => !isBase(c)).length
      expect(wideAffected).toBeGreaterThan(narrowAffected)
    })
  })

  describe('resolvePalette', () => {
    it('returns solidColor of defaultColor when source is undefined', () => {
      const f = resolvePalette(undefined, BLUE)
      expect(f(0)).toEqual(BLUE)
      expect(f(99)).toEqual(BLUE)
    })

    it('returns solidColor of source when source is a single RGB', () => {
      const f = resolvePalette(RED, BLUE)
      expect(f(0)).toEqual(RED)
      expect(f(5)).toEqual(RED)
    })

    it('returns gradient of source when source is a Palette', () => {
      const palette: Palette = [RED, GREEN, BLUE]
      const f = resolvePalette(palette, [0, 0, 0] as RGB)
      expect(f(0)).toEqual(RED)
      expect(f(1)).toEqual(GREEN)
      expect(f(2)).toEqual(BLUE)
      expect(f(3)).toEqual(RED) // wraps
    })

    it('handles single-RGB source with first channel that is itself an array-like primitive', () => {
      // Single RGB: [255, 0, 0] — element [0] is the number 255.
      // Palette: [[255,0,0]] — element [0] is an array.
      // resolvePalette uses ArrayIsArray(source[0]) to disambiguate.
      const single = resolvePalette([255, 0, 0] as RGB, BLUE)
      const palette = resolvePalette([[255, 0, 0]] as Palette, BLUE)
      expect(single(0)).toEqual([255, 0, 0])
      expect(palette(0)).toEqual([255, 0, 0])
    })
  })

  describe('frameColors', () => {
    it('returns one RGB per character', () => {
      const spec: ShimmerSpec = {
        positionAt: () => 0,
        kernel: blockKernel(1),
        baseColor: solidColor(RED),
        highlightColor: solidColor(WHITE),
      }
      expect(frameColors(spec, 5, 0)).toHaveLength(5)
      expect(frameColors(spec, 0, 0)).toEqual([])
    })

    it('is pure: same inputs → same outputs', () => {
      const spec = configToSpec({ color: RED, dir: 'ltr', speed: 1 }, 10)
      const a = frameColors(spec, 10, 5)
      const b = frameColors(spec, 10, 5)
      expect(a).toEqual(b)
    })

    it('different frames produce different output (when wave is moving)', () => {
      const spec = configToSpec({ color: RED, dir: 'ltr', speed: 1 }, 10)
      const a = frameColors(spec, 10, 0)
      const b = frameColors(spec, 10, 5)
      expect(a).not.toEqual(b)
    })
  })
})
