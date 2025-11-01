/**
 * @fileoverview Global theme context management.
 * Provides stateful theme management with stack-based scoping and event notifications.
 */

import type { Theme } from './types'
import { SOCKET_THEME, THEMES, type ThemeName } from './themes'

/**
 * Theme change event listener.
 */
export type ThemeChangeListener = (theme: Theme) => void

/**
 * Global theme context.
 */
type ThemeContext = {
  current: Theme
  stack: Theme[]
}

// Global state
// Default theme
let context: ThemeContext = {
  current: SOCKET_THEME,
  stack: [],
}

// Event listeners
const listeners: Set<ThemeChangeListener> = new Set()

/**
 * Set the global theme.
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
  context.current = typeof theme === 'string' ? THEMES[theme] : theme
  emitThemeChange(context.current)
}

/**
 * Get the current global theme.
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
  return context.current
}

/**
 * Push a new theme onto the stack and activate it.
 * Use `popTheme()` to restore the previous theme.
 *
 * @param theme - Theme object or theme name
 *
 * @example
 * ```ts
 * import { pushTheme, popTheme } from '@socketsecurity/lib/themes'
 *
 * pushTheme('ultra')
 * // ... operations with ultra theme ...
 * popTheme()  // Restore previous theme
 * ```
 */
export function pushTheme(theme: Theme | ThemeName): void {
  context.stack.push(context.current)
  setTheme(theme)
}

/**
 * Pop and restore the previous theme from the stack.
 * If the stack is empty, the current theme remains unchanged.
 *
 * @example
 * ```ts
 * import { pushTheme, popTheme } from '@socketsecurity/lib/themes'
 *
 * pushTheme('socket-firewall')
 * // ... operations ...
 * popTheme()  // Back to previous theme
 * ```
 */
export function popTheme(): void {
  const previous = context.stack.pop()
  if (previous) {
    context.current = previous
    emitThemeChange(context.current)
  }
}

/**
 * Execute an async operation with a temporary theme.
 * Automatically restores the previous theme when the operation completes.
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
 * // Theme automatically restored
 * ```
 */
export async function withTheme<T>(
  theme: Theme | ThemeName,
  fn: () => Promise<T>,
): Promise<T> {
  pushTheme(theme)
  try {
    return await fn()
  } finally {
    popTheme()
  }
}

/**
 * Execute a synchronous operation with a temporary theme.
 * Automatically restores the previous theme when the operation completes.
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
  pushTheme(theme)
  try {
    return fn()
  } finally {
    popTheme()
  }
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

/**
 * Reset theme context to default state (for testing).
 * @private
 */
export function resetThemeContext(): void {
  context = {
    current: SOCKET_THEME,
    stack: [],
  }
  listeners.clear()
}
