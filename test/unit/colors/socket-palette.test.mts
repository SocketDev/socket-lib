/**
 * @file Unit tests for the Socket terminal-color palette. Verifies:
 *
 *   - 24-bit ANSI escape sequence shape (prefix / payload / suffix)
 *   - Each theme returns the documented hex value via `palette.hex`
 *   - Default theme is `'dark'`
 *   - Each colorizer wraps an arbitrary string round-trip-clean The palette is
 *     consumed by Node CLIs / TUI tools that mirror the CSS design tokens
 *     defined in the fleet's `template/styles/tokens.css`.
 */

import { getPalette } from '../../../src/colors/socket-palette'
import type { SocketPaletteTheme } from '../../../src/colors/socket-palette'
import { describe, expect, it } from 'vitest'

describe('socket-palette', () => {
  describe('getPalette', () => {
    it('should default to dark theme', () => {
      const def = getPalette()
      const dark = getPalette('dark')
      expect(def.hex).toEqual(dark.hex)
    })

    it('should return the dark theme hex values', () => {
      const { hex } = getPalette('dark')
      expect(hex.socketPurple).toBe('#8c50ff')
      expect(hex.socketPink).toBe('#ff00aa')
      expect(hex.success).toBe('#4ade80')
      expect(hex.warning).toBe('#facc15')
      expect(hex.alert).toBe('#fb923c')
      expect(hex.error).toBe('#f87171')
      expect(hex.info).toBe('#60a5fa')
    })

    it('should return the light theme hex values', () => {
      const { hex } = getPalette('light')
      expect(hex.socketPurple).toBe('#8c50ff')
      expect(hex.socketPink).toBe('#ff00aa')
      expect(hex.success).toBe('#15803d')
      expect(hex.warning).toBe('#a16207')
      expect(hex.alert).toBe('#9a3412')
      expect(hex.error).toBe('#b91c1c')
      expect(hex.info).toBe('#1d4ed8')
    })

    it('should return the synthwave theme hex values', () => {
      const { hex } = getPalette('synthwave')
      expect(hex.socketPurple).toBe('#8c50ff')
      expect(hex.socketPink).toBe('#ff00aa')
      expect(hex.success).toBe('#50fa7b')
      expect(hex.warning).toBe('#f1fa8c')
      expect(hex.alert).toBe('#ffb86c')
      expect(hex.error).toBe('#ff6b9d')
      expect(hex.info).toBe('#8be9fd')
    })
  })

  describe('colorizers', () => {
    it('should wrap a string in a 24-bit ANSI sequence', () => {
      const { socketPurple } = getPalette('dark')
      const out = socketPurple('Socket')
      // #8c50ff => 140, 80, 255
      expect(out).toBe('[38;2;140;80;255mSocket[39m')
    })

    it('should be the same wrapper across themes for socket brand colors', () => {
      const themes: SocketPaletteTheme[] = ['dark', 'light', 'synthwave']
      const wraps = themes.map(t => getPalette(t).socketPink('x'))
      // #ff00aa is theme-stable.
      const expected = '[38;2;255;0;170mx[39m'
      for (const w of wraps) {
        expect(w).toBe(expected)
      }
    })

    it('should expose all status colorizers as functions', () => {
      const palette = getPalette('dark')
      expect(typeof palette.success).toBe('function')
      expect(typeof palette.warning).toBe('function')
      expect(typeof palette.alert).toBe('function')
      expect(typeof palette.error).toBe('function')
      expect(typeof palette.info).toBe('function')
    })

    it('should round-trip arbitrary string content unchanged', () => {
      const { success } = getPalette('dark')
      const payload = 'multi\nline	content'
      const out = success(payload)
      expect(out).toContain(payload)
      expect(out.startsWith('[38;2;')).toBe(true)
      expect(out.endsWith('[39m')).toBe(true)
    })

    it('should emit different escapes for different themes (status colors)', () => {
      const dark = getPalette('dark').success('ok')
      const light = getPalette('light').success('ok')
      expect(dark).not.toBe(light)
    })
  })
})
