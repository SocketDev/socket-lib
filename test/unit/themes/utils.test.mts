/**
 * @fileoverview Unit tests for theme utility functions.
 *
 * Tests color resolution utilities for Socket's theme system:
 * - resolveColor() resolves semantic color keywords (primary, secondary) to actual colors
 * - Handles color values as strings ('blue', 'red') or RGB tuples ([255, 0, 0])
 * - Fallback behavior: 'secondary' falls back to 'primary' when undefined
 * - 'inherit' keyword passes through unchanged
 * - Direct color values (non-keywords) pass through unchanged
 * Enables consistent theming across Socket CLI tools with semantic color names.
 */

import {
  RAINBOW_GRADIENT,
  createTheme,
  extendTheme,
  resolveColor,
  resolveShimmerColor,
} from '@socketsecurity/lib/themes/utils'
import { describe, expect, it } from 'vitest'

const BASE_COLORS = {
  primary: 'blue' as const,
  secondary: 'green' as const,
  success: 'green' as const,
  error: 'red' as const,
  warning: 'yellow' as const,
  info: 'cyan' as const,
  step: 'cyan' as const,
  text: 'white' as const,
  textDim: 'gray' as const,
  link: 'blue' as const,
  prompt: 'cyan' as const,
}

describe('themes/utils', () => {
  describe('resolveColor', () => {
    it('should resolve primary keyword', () => {
      const result = resolveColor('primary', {
        primary: 'blue' as const,
        secondary: 'green' as const,
        success: 'green' as const,
        error: 'red' as const,
        warning: 'yellow' as const,
        info: 'cyan' as const,
        step: 'cyan' as const,
        text: 'white' as const,
        textDim: 'gray' as const,
        link: 'blue' as const,
        prompt: 'cyan' as const,
      })
      expect(result).toBe('blue')
    })

    it('should resolve secondary keyword with fallback', () => {
      const result = resolveColor('secondary', {
        primary: 'blue' as const,
        success: 'green' as const,
        error: 'red' as const,
        warning: 'yellow' as const,
        info: 'cyan' as const,
        step: 'cyan' as const,
        text: 'white' as const,
        textDim: 'gray' as const,
        link: 'blue' as const,
        prompt: 'cyan' as const,
      })
      // Falls back to primary when secondary is undefined
      expect(result).toBe('blue')
    })

    it('should resolve secondary when defined', () => {
      const result = resolveColor('secondary', {
        primary: 'blue' as const,
        secondary: 'magenta' as const,
        success: 'green' as const,
        error: 'red' as const,
        warning: 'yellow' as const,
        info: 'cyan' as const,
        step: 'cyan' as const,
        text: 'white' as const,
        textDim: 'gray' as const,
        link: 'blue' as const,
        prompt: 'cyan' as const,
      })
      expect(result).toBe('magenta')
    })

    it('should resolve inherit keyword', () => {
      const result = resolveColor('inherit', {
        primary: 'blue' as const,
        secondary: 'green' as const,
        success: 'green' as const,
        error: 'red' as const,
        warning: 'yellow' as const,
        info: 'cyan' as const,
        step: 'cyan' as const,
        text: 'white' as const,
        textDim: 'gray' as const,
        link: 'blue' as const,
        prompt: 'cyan' as const,
      })
      expect(result).toBe('inherit')
    })

    it('should pass through color values', () => {
      const result = resolveColor('red', {
        primary: 'blue' as const,
        secondary: 'green' as const,
        success: 'green' as const,
        error: 'red' as const,
        warning: 'yellow' as const,
        info: 'cyan' as const,
        step: 'cyan' as const,
        text: 'white' as const,
        textDim: 'gray' as const,
        link: 'blue' as const,
        prompt: 'cyan' as const,
      })
      expect(result).toBe('red')
    })

    it('should pass through RGB tuples', () => {
      const result = resolveColor([255, 100, 50], {
        primary: 'blue' as const,
        secondary: 'green' as const,
        success: 'green' as const,
        error: 'red' as const,
        warning: 'yellow' as const,
        info: 'cyan' as const,
        step: 'cyan' as const,
        text: 'white' as const,
        textDim: 'gray' as const,
        link: 'blue' as const,
        prompt: 'cyan' as const,
      })
      expect(result).toEqual([255, 100, 50])
    })

    it('should resolve primary as RGB tuple', () => {
      const result = resolveColor('primary', {
        primary: [100, 150, 200] as const,
        secondary: 'green' as const,
        success: 'green' as const,
        error: 'red' as const,
        warning: 'yellow' as const,
        info: 'cyan' as const,
        step: 'cyan' as const,
        text: 'white' as const,
        textDim: 'gray' as const,
        link: 'blue' as const,
        prompt: 'cyan' as const,
      })
      expect(result).toEqual([100, 150, 200])
    })
  })

  describe('color resolution edge cases', () => {
    it('should handle mixed color value types', () => {
      const colors = {
        primary: 'blue' as const,
        secondary: [100, 150, 200] as const,
        success: 'green' as const,
        error: [255, 0, 0] as const,
        warning: 'yellow' as const,
        info: 'cyan' as const,
        step: 'cyan' as const,
        text: 'white' as const,
        textDim: 'gray' as const,
        link: 'blue' as const,
        prompt: 'cyan' as const,
      }
      expect(resolveColor('primary', colors)).toBe('blue')
      expect(resolveColor('secondary', colors)).toEqual([100, 150, 200])
    })

    it('should handle arbitrary color names', () => {
      const result = resolveColor('yellowBright' as any, {
        primary: 'blue' as const,
        secondary: 'green' as const,
        success: 'green' as const,
        error: 'red' as const,
        warning: 'yellow' as const,
        info: 'cyan' as const,
        step: 'cyan' as const,
        text: 'white' as const,
        textDim: 'gray' as const,
        link: 'blue' as const,
        prompt: 'cyan' as const,
      })
      expect(result).toBe('yellowBright')
    })

    it('should resolve rainbow keyword to RAINBOW_GRADIENT', () => {
      const result = resolveColor('rainbow', BASE_COLORS)
      expect(result).toEqual(RAINBOW_GRADIENT)
    })
  })

  describe('RAINBOW_GRADIENT', () => {
    it('exposes a 10-color palette', () => {
      expect(RAINBOW_GRADIENT).toHaveLength(10)
    })

    it('every entry is a 3-tuple of 0-255 integers', () => {
      for (const c of RAINBOW_GRADIENT) {
        expect(c).toHaveLength(3)
        for (const ch of c) {
          expect(Number.isInteger(ch)).toBe(true)
          expect(ch).toBeGreaterThanOrEqual(0)
          expect(ch).toBeLessThanOrEqual(255)
        }
      }
    })
  })

  describe('resolveShimmerColor', () => {
    const baseTheme = {
      name: 'test',
      displayName: 'Test',
      colors: BASE_COLORS,
    }

    it('returns inherit for undefined input', () => {
      expect(resolveShimmerColor(undefined, baseTheme)).toBe('inherit')
    })

    it('returns inherit for explicit inherit keyword', () => {
      expect(resolveShimmerColor('inherit', baseTheme)).toBe('inherit')
    })

    it('returns RAINBOW_GRADIENT for rainbow keyword', () => {
      expect(resolveShimmerColor('rainbow', baseTheme)).toEqual(
        RAINBOW_GRADIENT,
      )
    })

    it('passes through gradients (array of RGB tuples)', () => {
      const gradient = [
        [255, 0, 0],
        [0, 255, 0],
        [0, 0, 255],
      ] as const
      expect(resolveShimmerColor(gradient as any, baseTheme)).toEqual(gradient)
    })

    it('passes through single RGB tuples', () => {
      expect(resolveShimmerColor([100, 150, 200] as any, baseTheme)).toEqual([
        100, 150, 200,
      ])
    })

    it('resolves a primary keyword via the theme palette', () => {
      expect(resolveShimmerColor('primary', baseTheme)).toBe('blue')
    })

    it('resolves a named color value', () => {
      expect(resolveShimmerColor('red', baseTheme)).toBe('red')
    })
  })

  describe('createTheme', () => {
    it('creates a theme with required fields', () => {
      const theme = createTheme({
        name: 'custom',
        displayName: 'Custom',
        colors: BASE_COLORS,
      })
      expect(theme.name).toBe('custom')
      expect(theme.displayName).toBe('Custom')
      expect(theme.colors).toEqual({ __proto__: null, ...BASE_COLORS })
    })

    it('keeps optional effects and meta when provided', () => {
      const theme = createTheme({
        name: 'custom',
        displayName: 'Custom',
        colors: BASE_COLORS,
        effects: { spinner: { color: 'primary' } },
        meta: { description: 'A test theme' },
      })
      expect(theme.effects?.spinner?.color).toBe('primary')
      expect(theme.meta?.description).toBe('A test theme')
    })

    it('omits effects and meta when not provided', () => {
      const theme = createTheme({
        name: 'custom',
        displayName: 'Custom',
        colors: BASE_COLORS,
      })
      expect(theme.effects).toBeUndefined()
      expect(theme.meta).toBeUndefined()
    })
  })

  describe('extendTheme', () => {
    const base = createTheme({
      name: 'base',
      displayName: 'Base',
      colors: BASE_COLORS,
      effects: {
        spinner: { color: 'primary' },
        shimmer: { enabled: true, direction: 'ltr' },
        pulse: { speed: 1000 },
      },
      meta: { description: 'Base theme' },
    })

    it('inherits all fields from the base when overrides are empty', () => {
      const ext = extendTheme(base, {})
      expect(ext.name).toBe('base')
      expect(ext.colors).toEqual({ __proto__: null, ...BASE_COLORS })
      expect(ext.effects?.spinner?.color).toBe('primary')
    })

    it('overrides scalar fields', () => {
      const ext = extendTheme(base, { name: 'derived' })
      expect(ext.name).toBe('derived')
      expect(ext.displayName).toBe('Base')
    })

    it('deep-merges colors', () => {
      const ext = extendTheme(base, { colors: { primary: 'magenta' } })
      expect(ext.colors.primary).toBe('magenta')
      // Other colors stay from base.
      expect(ext.colors.error).toBe('red')
    })

    it('deep-merges spinner effects', () => {
      const ext = extendTheme(base, {
        effects: { spinner: { color: 'secondary' } },
      })
      expect(ext.effects?.spinner?.color).toBe('secondary')
    })

    it('deep-merges shimmer effects', () => {
      const ext = extendTheme(base, {
        effects: { shimmer: { speed: 2 } },
      })
      // Override field comes through.
      expect(ext.effects?.shimmer?.speed).toBe(2)
      // Base fields survive.
      expect(ext.effects?.shimmer?.enabled).toBe(true)
      expect(ext.effects?.shimmer?.direction).toBe('ltr')
    })

    it('deep-merges pulse effects', () => {
      const ext = extendTheme(base, {
        effects: { pulse: { speed: 500 } },
      })
      expect(ext.effects?.pulse?.speed).toBe(500)
    })

    it('deep-merges meta', () => {
      const ext = extendTheme(base, {
        meta: { author: 'jdalton' },
      })
      expect(ext.meta?.author).toBe('jdalton')
      expect(ext.meta?.description).toBe('Base theme')
    })

    it('preserves base.effects when overrides.effects is undefined', () => {
      const ext = extendTheme(base, { name: 'derived' })
      expect(ext.effects?.spinner?.color).toBe('primary')
      expect(ext.effects?.shimmer?.enabled).toBe(true)
    })

    it('preserves base.meta when overrides.meta is undefined', () => {
      const ext = extendTheme(base, { name: 'derived' })
      expect(ext.meta?.description).toBe('Base theme')
    })
  })
})
