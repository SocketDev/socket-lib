/**
 * @file Elegant theme context management. Async-aware theming with automatic
 *   context isolation via AsyncLocalStorage.
 */

import type { AsyncLocalStorage } from 'node:async_hooks'

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

// AsyncLocalStorage singleton for theme context isolation. Construction is
// DEFERRED to first use (see getThemeStorage below) to keep module import
// snapshot-safe.
let themeStorage: AsyncLocalStorage<Theme> | undefined

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
  return getThemeStorage().getStore() ?? fallbackTheme
}

/**
 * Get the process-scoped AsyncLocalStorage used for theme context isolation.
 *
 * Constructed LAZILY (memoized) rather than at module-eval: an
 * AsyncLocalStorage holds a live native handle, and constructing it at import
 * time pins that handle into every module transitively importing this leaf —
 * aborting V8 --build-snapshot serialization. Deferring to first use keeps the
 * single-store semantics while leaving module import snapshot-safe.
 *
 * @private
 */
export function getThemeStorage(): AsyncLocalStorage<Theme> {
  if (themeStorage === undefined) {
    const { AsyncLocalStorage } = getAsyncHooks()
    themeStorage = new AsyncLocalStorage<Theme>()
  }
  return themeStorage
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
  return await getThemeStorage().run(resolvedTheme, async () => {
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
  return getThemeStorage().run(resolvedTheme, () => {
    emitThemeChange(resolvedTheme)
    return fn()
  })
}
