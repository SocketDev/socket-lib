/**
 * @file Constructor-options parsing for the `Logger` class. Pulls the
 *   options-shape inspection (null-prototype clone, original-stdout capture,
 *   theme-name-or-object resolution) out of `./node` so the class constructor
 *   stays a thin shell over `parseLoggerOptions`. Returns a normalized
 *   `ParsedLoggerOptions`; the constructor copies the fields onto its private
 *   slots.
 */

import { THEMES } from '../themes/themes'

import type { Theme } from '../themes/types'

/**
 * The normalized result of inspecting the first `Logger` constructor argument.
 */
export interface ParsedLoggerOptions {
  /**
   * Null-prototype clone of the options object (empty when no options were
   * passed). Stored for future extensibility.
   */
  options: Record<string, unknown>
  /**
   * The caller-supplied stdout stream, used by `write()` to bypass Console
   * formatting. `undefined` when not provided.
   */
  originalStdout: NodeJS.WritableStream | undefined
  /**
   * The resolved instance theme: a `THEMES` entry when a theme name was given,
   * the object itself when a `Theme` was given, or `undefined` otherwise.
   */
  theme: Theme | undefined
}

/**
 * Parse the first `Logger` constructor argument into normalized option slots.
 *
 * A `theme` string is resolved against `THEMES` (unknown names yield no theme);
 * a `theme` object is used directly. When the first argument is not an object,
 * every slot defaults (empty null-prototype options, no stdout, no theme).
 *
 * @param args - The raw `Logger` constructor arguments.
 */
export function parseLoggerOptions(args: unknown[]): ParsedLoggerOptions {
  const options = args[0]
  if (typeof options !== 'object' || options === null) {
    return {
      options: { __proto__: null } as Record<string, unknown>,
      originalStdout: undefined,
      theme: undefined,
    }
  }
  const originalStdout = (
    options as { stdout?: NodeJS.WritableStream | undefined }
  ).stdout
  const themeOption = (options as { theme?: unknown | undefined }).theme
  let theme: Theme | undefined
  if (typeof themeOption === 'string') {
    theme = THEMES[themeOption as keyof typeof THEMES]
  } else if (themeOption) {
    theme = themeOption as Theme
  }
  return {
    options: { __proto__: null, ...options } as Record<string, unknown>,
    originalStdout,
    theme,
  }
}
