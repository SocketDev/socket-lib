/**
 * @file Elegant theme context management. Async-aware theming with automatic
 *   context isolation via AsyncLocalStorage.
 */

import type { Theme } from './types'
import { SOCKET_THEME, THEMES } from './themes'
import type { ThemeName } from './themes'

import { SetCtor } from '../primordials/map-set'
import { getNodeAsyncHooks } from '../node/async-hooks'

/**
 * Theme change event listener signature.
 */
export type ThemeChangeListener = (theme: Theme) => void

/**
 * Emit theme change event to listeners.
 *
 * @private
 */
export function emitThemeChange(theme: Theme): void {
  for (const listener of listeners) {
    listener(theme)
  }
}

/**
 * Lazily load the async_hooks module. Aliases the canonical `node/async-hooks`
 * accessor (single owner of the bundler-safe require); kept as an export so
 * this module's surface is unchanged.
 *
 * @private
 */
export const getAsyncHooks = getNodeAsyncHooks

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
const listeners: Set<ThemeChangeListener> = new SetCtor()

/**
 * Get the active theme from context.
 *
 * @example
 *   ;```ts
 *   const theme = getTheme()
 *   console.log(theme.displayName)
 *   ```
 *
 * @returns Current theme
 */
export function getTheme(): Theme {
  return themeStorage.getStore() ?? fallbackTheme
}

/**
 * Subscribe to theme change events.
 *
 * @example
 *   ;```ts
 *   const unsubscribe = onThemeChange(theme => {
 *     console.log('Theme:', theme.displayName)
 *   })
 *
 *   // Cleanup
 *   unsubscribe()
 *   ```
 *
 * @param listener - Change handler.
 *
 * @returns Unsubscribe function
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
 * @example
 *   ;```ts
 *   setTheme('socket-firewall')
 *   ```
 *
 * @param theme - Theme name or object.
 */
export function setTheme(theme: Theme | ThemeName): void {
  fallbackTheme =
    typeof theme === 'string' ? (THEMES[theme] ?? fallbackTheme) : theme
  emitThemeChange(fallbackTheme)
}

/**
 * Execute async operation with scoped theme. Theme automatically restored on
 * completion.
 *
 * @example
 *   ;```ts
 *   await withTheme('ultra', async () => {
 *     // Operations use Ultra theme
 *   })
 *   ```
 *
 * @template T - Return type.
 *
 * @param theme - Scoped theme.
 * @param fn - Async operation.
 *
 * @returns Operation result
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
 * Execute sync operation with scoped theme. Theme automatically restored on
 * completion.
 *
 * @example
 *   ;```ts
 *   const result = withThemeSync('coana', () => {
 *     return processData()
 *   })
 *   ```
 *
 * @template T - Return type.
 *
 * @param theme - Scoped theme.
 * @param fn - Sync operation.
 *
 * @returns Operation result
 */
export function withThemeSync<T>(theme: Theme | ThemeName, fn: () => T): T {
  const resolvedTheme: Theme =
    typeof theme === 'string' ? (THEMES[theme] ?? fallbackTheme) : theme
  return themeStorage.run(resolvedTheme, () => {
    emitThemeChange(resolvedTheme)
    return fn()
  })
}
