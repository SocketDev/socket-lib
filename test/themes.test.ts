/**
 * @fileoverview Tests for theme system.
 */

import {
  SOCKET_THEME,
  THEMES,
  createTheme,
  extendTheme,
  getTheme,
  popTheme,
  pushTheme,
  resetThemeContext,
  resolveColor,
  setTheme,
  withTheme,
  withThemeSync,
} from '@socketsecurity/lib/themes'
import { afterEach, describe, expect, it } from 'vitest'

describe('themes', () => {
  afterEach(() => {
    resetThemeContext()
  })

  describe('THEMES', () => {
    it('should have all default themes', () => {
      expect(THEMES).toHaveProperty('socket')
      expect(THEMES).toHaveProperty('coana')
      expect(THEMES).toHaveProperty('socket-firewall')
      expect(THEMES).toHaveProperty('socket-cli-python')
      expect(THEMES).toHaveProperty('ultra')
    })

    it('should have valid theme structures', () => {
      for (const theme of Object.values(THEMES)) {
        expect(theme).toHaveProperty('name')
        expect(theme).toHaveProperty('displayName')
        expect(theme).toHaveProperty('colors')
        expect(theme.colors).toHaveProperty('primary')
        expect(theme.colors).toHaveProperty('success')
        expect(theme.colors).toHaveProperty('error')
      }
    })
  })

  describe('setTheme / getTheme', () => {
    it('should set and get theme', () => {
      setTheme('coana')
      expect(getTheme().name).toBe('coana')
    })

    it('should set theme by object', () => {
      setTheme(THEMES['socket-firewall'])
      expect(getTheme().name).toBe('socket-firewall')
    })

    it('should default to socket theme', () => {
      expect(getTheme().name).toBe('socket')
    })
  })

  describe('pushTheme / popTheme', () => {
    it('should push and pop themes', () => {
      setTheme('socket')
      expect(getTheme().name).toBe('socket')

      pushTheme('coana')
      expect(getTheme().name).toBe('coana')

      popTheme()
      expect(getTheme().name).toBe('socket')
    })

    it('should support nested push/pop', () => {
      setTheme('socket')

      pushTheme('coana')
      expect(getTheme().name).toBe('coana')

      pushTheme('ultra')
      expect(getTheme().name).toBe('ultra')

      popTheme()
      expect(getTheme().name).toBe('coana')

      popTheme()
      expect(getTheme().name).toBe('socket')
    })

    it('should handle pop with empty stack', () => {
      setTheme('socket')
      popTheme() // Should be a no-op
      expect(getTheme().name).toBe('socket')
    })
  })

  describe('withTheme', () => {
    it('should apply theme for async operation', async () => {
      setTheme('socket')

      const result = await withTheme('coana', async () => {
        expect(getTheme().name).toBe('coana')
        return 42
      })

      expect(result).toBe(42)
      expect(getTheme().name).toBe('socket')
    })

    it('should restore theme even if operation throws', async () => {
      setTheme('socket')

      await expect(
        withTheme('coana', async () => {
          throw new Error('test error')
        }),
      ).rejects.toThrow('test error')

      expect(getTheme().name).toBe('socket')
    })
  })

  describe('withThemeSync', () => {
    it('should apply theme for sync operation', () => {
      setTheme('socket')

      const result = withThemeSync('coana', () => {
        expect(getTheme().name).toBe('coana')
        return 42
      })

      expect(result).toBe(42)
      expect(getTheme().name).toBe('socket')
    })

    it('should restore theme even if operation throws', () => {
      setTheme('socket')

      expect(() => {
        withThemeSync('coana', () => {
          throw new Error('test error')
        })
      }).toThrow('test error')

      expect(getTheme().name).toBe('socket')
    })
  })

  describe('resolveColor', () => {
    it('should resolve primary color reference', () => {
      const resolved = resolveColor('primary', SOCKET_THEME.colors)
      expect(resolved).toEqual([140, 82, 255])
    })

    it('should resolve secondary color reference', () => {
      const resolved = resolveColor('secondary', THEMES.coana.colors)
      expect(resolved).toEqual([50, 150, 200])
    })

    it('should resolve secondary to primary if not defined', () => {
      const resolved = resolveColor('secondary', SOCKET_THEME.colors)
      expect(resolved).toEqual([140, 82, 255])
    })

    it('should pass through named colors', () => {
      const resolved = resolveColor('red', SOCKET_THEME.colors)
      expect(resolved).toBe('red')
    })

    it('should pass through RGB colors', () => {
      const rgb = [255, 0, 0] as const
      const resolved = resolveColor(rgb, SOCKET_THEME.colors)
      expect(resolved).toEqual(rgb)
    })

    it('should handle inherit', () => {
      const resolved = resolveColor('inherit', SOCKET_THEME.colors)
      expect(resolved).toBe('inherit')
    })
  })

  describe('extendTheme', () => {
    it('should extend theme with new colors', () => {
      const extended = extendTheme(SOCKET_THEME, {
        colors: {
          primary: [255, 100, 200],
        },
      })

      expect(extended.colors.primary).toEqual([255, 100, 200])
      expect(extended.colors.success).toBe('green') // Preserved
    })

    it('should extend theme with new name', () => {
      const extended = extendTheme(SOCKET_THEME, {
        name: 'my-theme',
        displayName: 'My Theme',
      })

      expect(extended.name).toBe('my-theme')
      expect(extended.displayName).toBe('My Theme')
    })
  })

  describe('createTheme', () => {
    it('should create new theme', () => {
      const theme = createTheme({
        name: 'test',
        displayName: 'Test Theme',
        colors: {
          primary: [255, 0, 0],
          success: 'green',
          error: 'red',
          warning: 'yellow',
          info: 'blue',
          step: 'cyan',
          text: 'white',
          textDim: 'gray',
          link: 'cyan',
          prompt: 'primary',
        },
      })

      expect(theme.name).toBe('test')
      expect(theme.displayName).toBe('Test Theme')
      expect(theme.colors.primary).toEqual([255, 0, 0])
    })
  })
})
