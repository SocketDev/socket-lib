/**
 * @file Symbol exports + the `LOG_SYMBOLS` proxy. The two `Symbol.for(...)`
 *   constants are how the spinner (and tests) reach into a `Logger` instance to
 *   bump the call counter and toggle blank-line tracking without exposing
 *   private fields. The `LOG_SYMBOLS` proxy is the public colored-symbol
 *   palette that lazily initializes on first access (so importing the logger
 *   during early Node.js bootstrap doesn't pre-resolve the theme before themes
 *   are configured) and re-renders whenever `setTheme()` fires
 *   `onThemeChange`.
 */

/* oxlint-disable socket/no-status-emoji */
// This module is the canonical owner of LOG_SYMBOLS — it constructs
// the very symbols that the rule advises callers to use via
// `logger.success()` / `logger.fail()` / `logger.warn()`. The rule
// has no way to except its own source.

import isUnicodeSupported from '../external/@socketregistry/is-unicode-supported'

import { ProxyCtor } from '../primordials/globals'

import { ObjectGetOwnPropertySymbols } from '../primordials/object'

import { ReflectOwnKeys } from '../primordials/reflect'
import { getTheme, onThemeChange } from '../themes/context'

import { applyColor, getYoctocolors } from './colors'
import { globalConsole } from './_internal'

let _consoleSymbols: symbol[] | undefined
let _kGroupIndentationWidthSymbol: symbol | undefined

/**
 * Lazily get console symbols on first access.
 *
 * Deferred to avoid accessing global console during early Node.js bootstrap
 * before stdout is ready.
 */
export function getConsoleSymbols(): symbol[] {
  // Lazy-init second-call branch; module-singleton.
  /* c8 ignore start */
  if (_consoleSymbols === undefined) {
    _consoleSymbols = ObjectGetOwnPropertySymbols(globalConsole)
  }
  /* c8 ignore stop */
  return _consoleSymbols
}

/**
 * Lazily get kGroupIndentationWidth symbol on first access.
 */
export function getKGroupIndentationWidthSymbol(): symbol {
  /* c8 ignore next - Lazy-init second-call branch; module-singleton. */
  if (_kGroupIndentationWidthSymbol === undefined) {
    _kGroupIndentationWidthSymbol =
      getConsoleSymbols().find(s => (s as any).label === 'kGroupIndentWidth') ??
      Symbol('kGroupIndentWidth')
  }
  return _kGroupIndentationWidthSymbol
}

/**
 * Symbol for incrementing the internal log call counter.
 *
 * This is an internal symbol used to track the number of times logging methods
 * have been called on a logger instance.
 */
export const incLogCallCountSymbol = Symbol.for('logger.logCallCount++')

/**
 * Symbol for tracking whether the last logged line was blank.
 *
 * This is used internally to prevent multiple consecutive blank lines and to
 * determine whether to add spacing before certain messages.
 */
export const lastWasBlankSymbol = Symbol.for('logger.lastWasBlank')

/**
 * Log symbols for terminal output with colored indicators.
 *
 * Provides colored Unicode symbols (✖, ℹ, ∴, →, ✔, ⚠) with ASCII fallbacks (×,
 * i, :., >, √, ‼) for terminals that don't support Unicode. Symbols are colored
 * according to the active theme's color palette (error, info, reason, step,
 * success, warning).
 *
 * The symbols are lazily initialized on first access and automatically update
 * when the fallback theme changes (via setTheme()). Note that LOG_SYMBOLS
 * reflect the global fallback theme, not async-local theme contexts from
 * withTheme().
 *
 * @example
 *   ```typescript
 *   import { LOG_SYMBOLS } from '@socketsecurity/lib/logger/symbols'
 *
 *   console.log(`${LOG_SYMBOLS.fail} Build failed`) // Theme error color ✖
 *   console.log(`${LOG_SYMBOLS.info} Starting process`) // Theme info color ℹ
 *   console.log(`${LOG_SYMBOLS.progress} Working on task`) // Theme step color ∴
 *   console.log(`${LOG_SYMBOLS.step} Processing files`) // Theme step color →
 *   console.log(`${LOG_SYMBOLS.success} Build completed`) // Theme success color ✔
 *   console.log(`${LOG_SYMBOLS.warn} Deprecated API used`) // Theme warning color ⚠
 *   ```
 */
export const LOG_SYMBOLS = /*@__PURE__*/ (() => {
  const target: Record<string, string> = {
    __proto__: null,
  } as unknown as Record<string, string>

  let initialized = false

  // Mutable handler to simulate a frozen target.
  const handler: ProxyHandler<Record<string, string>> = {
    __proto__: null,
  } as unknown as ProxyHandler<Record<string, string>>

  const updateSymbols = () => {
    const supported = isUnicodeSupported()
    const colors = getYoctocolors()
    const theme = getTheme()

    // Get colors from theme
    const successColor = theme.colors.success
    const errorColor = theme.colors.error
    const warningColor = theme.colors.warning
    const infoColor = theme.colors.info
    const stepColor = theme.colors.step

    /* c8 ignore start - ASCII-fallback symbol arms only fire on
       terminals without unicode support; tests run on unicode TTYs. */
    target['fail'] = applyColor(supported ? '✖' : '×', errorColor, colors)
    target['info'] = applyColor(supported ? 'ℹ' : 'i', infoColor, colors)
    target['progress'] = applyColor(supported ? '∴' : ':.', stepColor, colors)
    target['reason'] = colors.dim(
      applyColor(supported ? '∴' : ':.', warningColor, colors),
    )
    target['skip'] = applyColor(supported ? '↻' : '@', stepColor, colors)
    target['step'] = applyColor(supported ? '→' : '>', stepColor, colors)
    target['success'] = applyColor(supported ? '✔' : '√', successColor, colors)
    target['warn'] = applyColor(supported ? '⚠' : '‼', warningColor, colors)
    /* c8 ignore stop */
  }

  const init = () => {
    // Idempotent guard; init runs once.
    /* c8 ignore start */
    if (initialized) {
      return
    }
    /* c8 ignore stop */

    updateSymbols()
    initialized = true

    // The handler of a Proxy is mutable after proxy instantiation.
    // We delete the traps to defer to native behavior for better performance.
    for (const trapName in handler) {
      delete handler[trapName as keyof ProxyHandler<Record<string, string>>]
    }
  }

  const reset = () => {
    // Defensive guard; reset only runs after init.
    /* c8 ignore start */
    if (!initialized) {
      return
    }
    /* c8 ignore stop */

    // Update symbols with new theme colors
    updateSymbols()
  }

  for (const trapName of ReflectOwnKeys(Reflect)) {
    const fn = (Reflect as Record<PropertyKey, unknown>)[trapName]
    if (typeof fn === 'function') {
      ;(handler as Record<string, (...args: unknown[]) => unknown>)[
        trapName as string
      ] = (...args: unknown[]) => {
        init()
        return fn(...args)
      }
    }
  }

  /* c8 ignore next 4 - onThemeChange callback fires only when
     setTheme() is called at runtime; tests use the static default
     theme. */
  // Listen for theme changes and reset symbols
  onThemeChange(() => {
    reset()
  })

  return new ProxyCtor(target, handler)
})()
