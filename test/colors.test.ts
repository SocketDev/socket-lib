/**
 * @fileoverview Unit tests for color utilities.
 *
 * Tests color conversion and type guard functions:
 * - isRgbTuple() type guard for RGB vs named colors
 * - toRgb() conversion from named colors to RGB tuples
 * - All ColorName mappings to RGB values
 * - RGB tuple passthrough behavior
 * Used throughout Socket CLI for consistent color handling in spinners, loggers, and UI.
 */

import {
  type ColorName,
  type ColorRgb,
  type ColorValue,
  isRgbTuple,
  toRgb,
} from '@socketsecurity/lib/colors'
import { describe, expect, it } from 'vitest'

describe('colors', () => {
  describe('isRgbTuple', () => {
    it('should return true for RGB tuple', () => {
      const color: ColorValue = [255, 0, 0]
      expect(isRgbTuple(color)).toBe(true)
    })

    it('should return false for color name string', () => {
      const color: ColorValue = 'red'
      expect(isRgbTuple(color)).toBe(false)
    })

    it('should work as type guard', () => {
      const color: ColorValue = [140, 82, 255]
      if (isRgbTuple(color)) {
        // TypeScript should narrow type to ColorRgb here
        const [r, g, b] = color
        expect(r).toBe(140)
        expect(g).toBe(82)
        expect(b).toBe(255)
      } else {
        throw new Error('Should have been RGB tuple')
      }
    })

    it('should handle zero values in RGB tuple', () => {
      const color: ColorValue = [0, 0, 0]
      expect(isRgbTuple(color)).toBe(true)
    })

    it('should handle max values in RGB tuple', () => {
      const color: ColorValue = [255, 255, 255]
      expect(isRgbTuple(color)).toBe(true)
    })
  })

  describe('toRgb', () => {
    describe('RGB tuple passthrough', () => {
      it('should return RGB tuple as-is', () => {
        const color: ColorRgb = [140, 82, 255]
        const result = toRgb(color)
        expect(result).toBe(color)
        expect(result).toEqual([140, 82, 255])
      })

      it('should handle black RGB tuple', () => {
        const color: ColorRgb = [0, 0, 0]
        expect(toRgb(color)).toBe(color)
      })

      it('should handle white RGB tuple', () => {
        const color: ColorRgb = [255, 255, 255]
        expect(toRgb(color)).toBe(color)
      })

      it('should preserve tuple reference', () => {
        const color: ColorRgb = [100, 150, 200]
        const result = toRgb(color)
        expect(result).toBe(color) // Same reference
      })
    })

    describe('named color conversion', () => {
      it('should convert "black" to RGB', () => {
        expect(toRgb('black')).toEqual([0, 0, 0])
      })

      it('should convert "blue" to RGB', () => {
        expect(toRgb('blue')).toEqual([0, 0, 255])
      })

      it('should convert "blueBright" to RGB', () => {
        expect(toRgb('blueBright')).toEqual([100, 149, 237])
      })

      it('should convert "cyan" to RGB', () => {
        expect(toRgb('cyan')).toEqual([0, 255, 255])
      })

      it('should convert "cyanBright" to RGB', () => {
        expect(toRgb('cyanBright')).toEqual([0, 255, 255])
      })

      it('should convert "gray" to RGB', () => {
        expect(toRgb('gray')).toEqual([128, 128, 128])
      })

      it('should convert "green" to RGB', () => {
        expect(toRgb('green')).toEqual([0, 128, 0])
      })

      it('should convert "greenBright" to RGB', () => {
        expect(toRgb('greenBright')).toEqual([0, 255, 0])
      })

      it('should convert "magenta" to RGB', () => {
        expect(toRgb('magenta')).toEqual([255, 0, 255])
      })

      it('should convert "magentaBright" to RGB', () => {
        expect(toRgb('magentaBright')).toEqual([255, 105, 180])
      })

      it('should convert "red" to RGB', () => {
        expect(toRgb('red')).toEqual([255, 0, 0])
      })

      it('should convert "redBright" to RGB', () => {
        expect(toRgb('redBright')).toEqual([255, 69, 0])
      })

      it('should convert "white" to RGB', () => {
        expect(toRgb('white')).toEqual([255, 255, 255])
      })

      it('should convert "whiteBright" to RGB', () => {
        expect(toRgb('whiteBright')).toEqual([255, 255, 255])
      })

      it('should convert "yellow" to RGB', () => {
        expect(toRgb('yellow')).toEqual([255, 255, 0])
      })

      it('should convert "yellowBright" to RGB', () => {
        expect(toRgb('yellowBright')).toEqual([255, 255, 153])
      })
    })

    describe('all ColorName mappings', () => {
      const colorNames: ColorName[] = [
        'black',
        'blue',
        'blueBright',
        'cyan',
        'cyanBright',
        'gray',
        'green',
        'greenBright',
        'magenta',
        'magentaBright',
        'red',
        'redBright',
        'white',
        'whiteBright',
        'yellow',
        'yellowBright',
      ]

      it.each(colorNames)(
        'should convert "%s" to valid RGB tuple',
        colorName => {
          const rgb = toRgb(colorName)
          expect(Array.isArray(rgb)).toBe(true)
          expect(rgb).toHaveLength(3)

          // Verify all RGB values are in valid range [0, 255]
          const [r, g, b] = rgb
          expect(r).toBeGreaterThanOrEqual(0)
          expect(r).toBeLessThanOrEqual(255)
          expect(g).toBeGreaterThanOrEqual(0)
          expect(g).toBeLessThanOrEqual(255)
          expect(b).toBeGreaterThanOrEqual(0)
          expect(b).toBeLessThanOrEqual(255)
        },
      )

      it('should return consistent RGB values for same color name', () => {
        const color: ColorName = 'cyan'
        const result1 = toRgb(color)
        const result2 = toRgb(color)
        expect(result1).toEqual(result2)
      })
    })

    describe('type safety', () => {
      it('should handle ColorValue union type', () => {
        const namedColor: ColorValue = 'red'
        const rgbColor: ColorValue = [255, 0, 0]

        expect(toRgb(namedColor)).toEqual([255, 0, 0])
        expect(toRgb(rgbColor)).toEqual([255, 0, 0])
      })

      it('should work with readonly RGB tuples', () => {
        const color: ColorRgb = [100, 150, 200] as const
        const result = toRgb(color)
        expect(result).toBe(color)
      })
    })
  })

  describe('color mapping correctness', () => {
    it('should have distinct RGB values for different color names', () => {
      const colorNames: ColorName[] = [
        'black',
        'blue',
        'blueBright',
        'gray',
        'green',
        'greenBright',
        'magenta',
        'magentaBright',
        'red',
        'redBright',
        'yellow',
        'yellowBright',
      ]

      const rgbValues = new Set<string>()

      for (const colorName of colorNames) {
        const rgb = toRgb(colorName)
        const key = rgb.join(',')

        // Note: cyan and cyanBright map to same RGB intentionally
        // white and whiteBright map to same RGB intentionally
        if (
          !['cyan', 'cyanBright', 'white', 'whiteBright'].includes(colorName)
        ) {
          expect(rgbValues.has(key)).toBe(false)
        }

        rgbValues.add(key)
      }
    })

    it('should have expected RGB values for common colors', () => {
      // Verify key colors have expected values
      expect(toRgb('black')).toEqual([0, 0, 0])
      expect(toRgb('white')).toEqual([255, 255, 255])
      expect(toRgb('red')).toEqual([255, 0, 0])
      expect(toRgb('green')).toEqual([0, 128, 0])
      expect(toRgb('blue')).toEqual([0, 0, 255])
      expect(toRgb('yellow')).toEqual([255, 255, 0])
      expect(toRgb('cyan')).toEqual([0, 255, 255])
      expect(toRgb('magenta')).toEqual([255, 0, 255])
      expect(toRgb('gray')).toEqual([128, 128, 128])
    })
  })
})
