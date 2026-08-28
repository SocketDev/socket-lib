/**
 * @file Unit tests for color-capability detection. Expected capabilities are
 *   spelled as literals rather than compared against the module's own exported
 *   constant, so an assertion cannot pass by agreeing with the value it is
 *   checking. Covers:
 *
 *   - getColorCapability() keyed on the target stream, including the no-stream
 *     case
 *   - isColorSupported() / isTrueColorSupported() gates
 *   - toColorCapability() over both detector branches
 *   - toColorPalette() level-to-name mapping
 *   - A pipe and a TTY resolving independently of one another
 */

import {
  getColorCapability,
  getSupportsColor,
  isColorSupported,
  isTrueColorSupported,
  toColorCapability,
  toColorPalette,
} from '../../../../src/term/colors/support.mjs'
import { describe, expect, it } from 'vitest'

const NO_COLOR_CAPABILITY = {
  has16m: false,
  has256: false,
  hasBasic: false,
  level: 0,
  palette: 'none',
}

describe('term/colors/support', () => {
  describe('toColorPalette', () => {
    it('maps every level to its palette name', () => {
      expect(toColorPalette(0)).toBe('none')
      expect(toColorPalette(1)).toBe('basic')
      expect(toColorPalette(2)).toBe('ansi256')
      expect(toColorPalette(3)).toBe('truecolor')
    })
  })

  describe('toColorCapability', () => {
    it('treats a false detector result as no color', () => {
      expect(toColorCapability(false)).toEqual(NO_COLOR_CAPABILITY)
    })

    it('carries the detector flags through and names the palette', () => {
      expect(
        toColorCapability({
          level: 3,
          hasBasic: true,
          has256: true,
          has16m: true,
        }),
      ).toEqual({
        palette: 'truecolor',
        level: 3,
        hasBasic: true,
        has256: true,
        has16m: true,
      })
    })

    it('names a basic-only stream basic', () => {
      const capability = toColorCapability({
        level: 1,
        hasBasic: true,
        has256: false,
        has16m: false,
      })
      expect(capability.palette).toBe('basic')
      expect(capability.has16m).toBe(false)
    })
  })

  describe('getColorCapability', () => {
    it('resolves nothing when no stream is named', () => {
      expect(getColorCapability()).toEqual(NO_COLOR_CAPABILITY)
      expect(getColorCapability({})).toEqual(NO_COLOR_CAPABILITY)
      expect(getColorCapability({ stream: undefined })).toEqual(
        NO_COLOR_CAPABILITY,
      )
    })

    it('reports no color for a non-TTY stream', () => {
      const capability = getColorCapability({ stream: { isTTY: false } })
      expect(capability.palette).toBe('none')
      expect(capability.level).toBe(0)
      expect(capability.hasBasic).toBe(false)
    })

    it('reports color for a TTY stream', () => {
      const capability = getColorCapability({ stream: { isTTY: true } })
      expect(capability.hasBasic).toBe(true)
      expect(capability.level).toBeGreaterThanOrEqual(1)
      expect(capability.palette).not.toBe('none')
    })

    it('accepts the sniffFlags input without changing a non-TTY verdict', () => {
      expect(
        getColorCapability({ stream: { isTTY: false }, sniffFlags: false }),
      ).toEqual(NO_COLOR_CAPABILITY)
    })

    it('resolves each stream on its own, so a pipe and a TTY can disagree', () => {
      const piped = getColorCapability({ stream: { isTTY: false } })
      const terminal = getColorCapability({ stream: { isTTY: true } })
      expect(piped.hasBasic).toBe(false)
      expect(terminal.hasBasic).toBe(true)
    })
  })

  describe('isColorSupported', () => {
    it('gates on the target stream', () => {
      expect(isColorSupported({ stream: { isTTY: true } })).toBe(true)
      expect(isColorSupported({ stream: { isTTY: false } })).toBe(false)
    })

    it('denies color when no stream is named', () => {
      expect(isColorSupported()).toBe(false)
    })
  })

  describe('isTrueColorSupported', () => {
    it('denies truecolor on a non-TTY stream', () => {
      expect(isTrueColorSupported({ stream: { isTTY: false } })).toBe(false)
    })

    it('denies truecolor when no stream is named', () => {
      expect(isTrueColorSupported()).toBe(false)
    })
  })

  describe('getSupportsColor', () => {
    it('exposes the per-stream factory the shim must not drop', () => {
      const factoryType = typeof getSupportsColor().createSupportsColor
      expect(factoryType).toBe('function')
    })

    it('caches the detector across calls', () => {
      const cachedIsSame = getSupportsColor() === getSupportsColor()
      expect(cachedIsSame).toBe(true)
    })
  })
})
