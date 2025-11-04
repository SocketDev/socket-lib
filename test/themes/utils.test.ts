/**
 * @fileoverview Unit tests for theme utility functions.
 */

import { resolveColor } from '@socketsecurity/lib/themes/utils'
import { describe, expect, it } from 'vitest'

describe('themes/utils', () => {
  describe('resolveColor', () => {
    it('should resolve primary keyword', () => {
      const result = resolveColor('primary', {
        primary: 'blue',
        secondary: 'green',
        success: 'green',
        error: 'red',
        warning: 'yellow',
        info: 'cyan',
        step: 'cyan',
      })
      expect(result).toBe('blue')
    })

    it('should resolve secondary keyword with fallback', () => {
      const result = resolveColor('secondary', {
        primary: 'blue',
        success: 'green',
        error: 'red',
        warning: 'yellow',
        info: 'cyan',
        step: 'cyan',
      })
      // Falls back to primary when secondary is undefined
      expect(result).toBe('blue')
    })

    it('should resolve secondary when defined', () => {
      const result = resolveColor('secondary', {
        primary: 'blue',
        secondary: 'magenta',
        success: 'green',
        error: 'red',
        warning: 'yellow',
        info: 'cyan',
        step: 'cyan',
      })
      expect(result).toBe('magenta')
    })

    it('should resolve inherit keyword', () => {
      const result = resolveColor('inherit', {
        primary: 'blue',
        secondary: 'green',
        success: 'green',
        error: 'red',
        warning: 'yellow',
        info: 'cyan',
        step: 'cyan',
      })
      expect(result).toBe('inherit')
    })

    it('should pass through color values', () => {
      const result = resolveColor('red', {
        primary: 'blue',
        secondary: 'green',
        success: 'green',
        error: 'red',
        warning: 'yellow',
        info: 'cyan',
        step: 'cyan',
      })
      expect(result).toBe('red')
    })

    it('should pass through RGB tuples', () => {
      const result = resolveColor([255, 100, 50], {
        primary: 'blue',
        secondary: 'green',
        success: 'green',
        error: 'red',
        warning: 'yellow',
        info: 'cyan',
        step: 'cyan',
      })
      expect(result).toEqual([255, 100, 50])
    })

    it('should resolve primary as RGB tuple', () => {
      const result = resolveColor('primary', {
        primary: [100, 150, 200],
        secondary: 'green',
        success: 'green',
        error: 'red',
        warning: 'yellow',
        info: 'cyan',
        step: 'cyan',
      })
      expect(result).toEqual([100, 150, 200])
    })
  })

  describe('color resolution edge cases', () => {
    it('should handle mixed color value types', () => {
      const colors = {
        primary: 'blue',
        secondary: [100, 150, 200] as [number, number, number],
        success: 'green',
        error: [255, 0, 0] as [number, number, number],
        warning: 'yellow',
        info: 'cyan',
        step: 'cyan',
      }
      expect(resolveColor('primary', colors)).toBe('blue')
      expect(resolveColor('secondary', colors)).toEqual([100, 150, 200])
    })

    it('should handle arbitrary color names', () => {
      const result = resolveColor('brightYellow', {
        primary: 'blue',
        secondary: 'green',
        success: 'green',
        error: 'red',
        warning: 'yellow',
        info: 'cyan',
        step: 'cyan',
      })
      expect(result).toBe('brightYellow')
    })
  })
})
