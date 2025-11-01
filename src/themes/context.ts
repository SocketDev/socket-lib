/**
 * @fileoverview Theme context management using AsyncLocalStorage.
 * Provides async-aware theme management with automatic context isolation.
 */

import { AsyncLocalStorage } from 'node:async_hooks'

import type { Theme } from './types'
import { SOCKET_THEME, THEMES, type ThemeName } from './themes'

/**
 * Theme change event listener.
 */
export type ThemeChangeListener = (theme: Theme) => void

/**
 * AsyncLocalStorage for theme context.
 * Automatically isolates theme state across async boundaries.
 */
const themeStorage = new AsyncLocalStorage<Theme>()

/**
 * Fallback theme when no async context is active.
 */
let fallbackTheme: Theme = SOCKET_THEME

// Event listeners
const listeners: Set<ThemeChangeListener> = new Set()

/**
 * Set the fallback theme (used when no async context is active).
 * This replaces the previous global theme setter.
 *
 * @param theme - Theme object or theme name
 *
 * @example
 * ```ts
 * import { setTheme } from '@socketsecurity/lib/themes'
 *
 * // Set by name
 * setTheme('socket-firewall')
 *
 * // Set by object
 * setTheme(customTheme)
 * ```
 */
export function setTheme(theme: Theme | ThemeName): void {
  fallbackTheme = typeof theme === 'string' ? THEMES[theme] : theme
  emitThemeChange(fallbackTheme)
}

/**
 * Get the current theme from async context or fallback.
 *
 * @returns Current theme
 *
 * @example
 * ```ts
 * import { getTheme } from '@socketsecurity/lib/themes'
 *
 * const theme = getTheme()
 * console.log(theme.displayName)  // "Socket Security"
 * ```
 */
export function getTheme(): Theme {
  return themeStorage.getStore() ?? fallbackTheme
}

/**
 * Execute an async operation with a temporary theme.
 * Uses AsyncLocalStorage for automatic context isolation.
 * Theme is automatically restored when the operation completes.
 *
 * @template T - Return type of the operation
 * @param theme - Theme to use during operation
 * @param fn - Async function to execute
 * @returns Result of the operation
 *
 * @example
 * ```ts
 * import { withTheme } from '@socketsecurity/lib/themes'
 * import { Spinner } from '@socketsecurity/lib/spinner'
 *
 * await withTheme('ultra', async () => {
 *   const spinner = Spinner({ text: 'Rainbow mode!' })
 *   spinner.start()
 *   await heavyOperation()
 *   spinner.stop()
 * })
 * // Theme automatically restored via AsyncLocalStorage
 * ```
 */
export async function withTheme<T>(
  theme: Theme | ThemeName,
  fn: () => Promise<T>,
): Promise<T> {
  const resolvedTheme = typeof theme === 'string' ? THEMES[theme] : theme
  return await themeStorage.run(resolvedTheme, async () => {
    emitThemeChange(resolvedTheme)
    return await fn()
  })
}

/**
 * Execute a synchronous operation with a temporary theme.
 * Uses AsyncLocalStorage for automatic context isolation.
 * Theme is automatically restored when the operation completes.
 *
 * @template T - Return type of the operation
 * @param theme - Theme to use during operation
 * @param fn - Synchronous function to execute
 * @returns Result of the operation
 *
 * @example
 * ```ts
 * import { withThemeSync } from '@socketsecurity/lib/themes'
 *
 * const result = withThemeSync('coana', () => {
 *   // Sync operations with coana theme
 *   return processData()
 * })
 * ```
 */
export function withThemeSync<T>(theme: Theme | ThemeName, fn: () => T): T {
  const resolvedTheme = typeof theme === 'string' ? THEMES[theme] : theme
  return themeStorage.run(resolvedTheme, () => {
    emitThemeChange(resolvedTheme)
    return fn()
  })
}

/**
 * Register a listener for theme change events.
 *
 * @param listener - Function to call when theme changes
 * @returns Unsubscribe function
 *
 * @example
 * ```ts
 * import { onThemeChange } from '@socketsecurity/lib/themes'
 *
 * const unsubscribe = onThemeChange((theme) => {
 *   console.log('Theme changed to:', theme.displayName)
 * })
 *
 * // Later: stop listening
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
 * Emit theme change event to all listeners.
 * @private
 */
function emitThemeChange(theme: Theme): void {
  for (const listener of listeners) {
    listener(theme)
  }
}
