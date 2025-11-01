/**
 * @fileoverview Theme system for Socket libraries.
 * Provides unified theming across spinners, logger, prompts, and links.
 *
 * @example
 * ```ts
 * import { setTheme, THEMES, Spinner } from '@socketsecurity/lib'
 *
 * // Set global theme
 * setTheme('socket-firewall')
 *
 * // Create themed spinner
 * const spinner = Spinner({ text: 'Loading...' })
 * spinner.start()  // Uses firewall theme (orange)
 * ```
 *
 * @example
 * ```ts
 * import { withTheme, createTheme } from '@socketsecurity/lib/themes'
 *
 * // Scoped theme usage
 * await withTheme('ultra', async () => {
 *   // All operations use ultra theme (rainbow)
 * })
 *
 * // Custom theme
 * const myTheme = createTheme({
 *   name: 'my-theme',
 *   displayName: 'My Theme',
 *   colors: {
 *     primary: [255, 100, 200],
 *     success: 'green',
 *     error: 'red',
 *     warning: 'yellow',
 *     info: 'blue',
 *     step: 'cyan',
 *     text: 'white',
 *     textDim: 'gray',
 *     link: 'cyan',
 *     prompt: 'primary'
 *   }
 * })
 * setTheme(myTheme)
 * ```
 */

// Re-export types
export type {
  ColorReference,
  Theme,
  ThemeColors,
  ThemeEffects,
  ThemeMeta,
} from './types'

// Re-export theme definitions
export {
  COANA_THEME,
  FIREWALL_THEME,
  PYTHON_THEME,
  SOCKET_THEME,
  THEMES,
  ULTRA_THEME,
  type ThemeName,
} from './themes'

// Re-export context management
export {
  getTheme,
  onThemeChange,
  setTheme,
  withTheme,
  withThemeSync,
  type ThemeChangeListener,
} from './context'

// Re-export utilities
export {
  createTheme,
  extendTheme,
  resolveColor,
  resolveShimmerColor,
} from './utils'
