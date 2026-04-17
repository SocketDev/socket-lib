/**
 * @fileoverview Elegant theme context management.
 * Async-aware theming with automatic context isolation via AsyncLocalStorage.
 */

import type { Theme } from './types'
import { SOCKET_THEME, THEMES, type ThemeName } from './themes'

let _async_hooks: typeof import('node:async_hooks') | undefined

/**
 * Theme change event listener signature.
 */
export type ThemeChangeListener = (theme: Theme) => void

/**
 * Emit theme change event to listeners.
 * @private
 */
function emitThemeChange(theme: Theme): void {
  for (const listener of listeners) {
    listener(theme)
  }
}

/**
 * Lazily load the async_hooks module to avoid Webpack errors.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getAsyncHooks() {
  if (_async_hooks === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _async_hooks = /*@__PURE__*/ require('node:async_hooks')
  }
  return _async_hooks as typeof import('node:async_hooks')
}

/**
 * AsyncLocalStorage for theme context isolation.
 */
const { AsyncLocalStorage } = getAsyncHooks()
const themeStorage = new AsyncLocalStorage<Theme>()

/**
 * Fallback theme for global context.
 */
let fallbackTheme: Theme = SOCKET_THEME

/**
 * Registered theme change listeners.
 */
const listeners: Set<ThemeChangeListener> = new Set()

/**
 * Get the active theme from context.
 *
 * @returns Current theme
 *
 * @example
 * ```ts
 * const theme = getTheme()
 * console.log(theme.displayName)
 * ```
 */
export function getTheme(): Theme {
  return themeStorage.getStore() ?? fallbackTheme
}

/**
 * Subscribe to theme change events.
 *
 * @param listener - Change handler
 * @returns Unsubscribe function
 *
 * @example
 * ```ts
 * const unsubscribe = onThemeChange((theme) => {
 *   console.log('Theme:', theme.displayName)
 * })
 *
 * // Cleanup
 * unsubscribe()
 * ```
 */
export function onThemeChange(listener: ThemeChangeListener): () => void {
  listeners.add(listener)
  return () => {
    listeners.delete(listener)
  }
}

/**
 * Set the global fallback theme.
 *
 * @param theme - Theme name or object
 *
 * @example
 * ```ts
 * setTheme('socket-firewall')
 * ```
 */
export function setTheme(theme: Theme | ThemeName): void {
  fallbackTheme =
    typeof theme === 'string' ? (THEMES[theme] ?? fallbackTheme) : theme
  emitThemeChange(fallbackTheme)
}

/**
 * Execute async operation with scoped theme.
 * Theme automatically restored on completion.
 *
 * @template T - Return type
 * @param theme - Scoped theme
 * @param fn - Async operation
 * @returns Operation result
 *
 * @example
 * ```ts
 * await withTheme('ultra', async () => {
 *   // Operations use Ultra theme
 * })
 * ```
 */
export async function withTheme<T>(
  theme: Theme | ThemeName,
  fn: () => Promise<T>,
): Promise<T> {
  const resolvedTheme: Theme =
    typeof theme === 'string' ? (THEMES[theme] ?? fallbackTheme) : theme
  return await themeStorage.run(resolvedTheme, async () => {
    emitThemeChange(resolvedTheme)
    return await fn()
  })
}

/**
 * Execute sync operation with scoped theme.
 * Theme automatically restored on completion.
 *
 * @template T - Return type
 * @param theme - Scoped theme
 * @param fn - Sync operation
 * @returns Operation result
 *
 * @example
 * ```ts
 * const result = withThemeSync('coana', () => {
 *   return processData()
 * })
 * ```
 */
export function withThemeSync<T>(theme: Theme | ThemeName, fn: () => T): T {
  const resolvedTheme: Theme =
    typeof theme === 'string' ? (THEMES[theme] ?? fallbackTheme) : theme
  return themeStorage.run(resolvedTheme, () => {
    emitThemeChange(resolvedTheme)
    return fn()
  })
}
