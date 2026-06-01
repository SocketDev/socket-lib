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

// This module is the canonical owner of LOG_SYMBOLS — it constructs
// the very symbols that the rule advises callers to use via
// `logger.success()` / `logger.fail()` / `logger.warn()`. The rule
// has no way to except its own source, so the emoji-bearing lines
// below carry per-line disables.

import isUnicodeSupported from '../external/@socketregistry/is-unicode-supported'

import { ProxyCtor } from '../primordials/globals'

import { ObjectGetOwnPropertySymbols } from '../primordials/object'

import { ReflectOwnKeys } from '../primordials/reflect'
import { getTheme, onThemeChange } from '../themes/context'

import { applyColor, getYoctocolors } from './colors'
import { globalConsole } from './_internal'

let consoleSymbols: symbol[] | undefined
let kGroupIndentationWidthSymbol: symbol | undefined

export function createLogSymbols(): Record<string, string> {
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
    // oxlint-disable-next-line socket/no-status-emoji -- This module is the canonical owner of LOG_SYMBOLS.success; it constructs the symbol the rule points callers at.
    target['success'] = applyColor(supported ? '✔' : '√', successColor, colors)
    // oxlint-disable-next-line socket/no-status-emoji -- This module is the canonical owner of LOG_SYMBOLS.warn; it constructs the symbol the rule points callers at.
    target['warn'] = applyColor(supported ? '⚠' : '‼', warningColor, colors)
    /* c8 ignore stop */
  }

  const init = () => {
    /* c8 ignore start - Idempotent guard; init runs once, second-call branch never re-enters. */
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
    /* c8 ignore start - Defensive guard; reset only runs after init, so the un-init branch is unreachable in tests. */
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
}

export function createLogSymbolsProxyPlaceholder(): void {}

/**
 * Lazily get console symbols on first access.
 *
 * Deferred to avoid accessing global console during early Node.js bootstrap
 * before stdout is ready.
 */
export function getConsoleSymbols(): symbol[] {
  /* c8 ignore start - Lazy-init second-call branch; module-singleton, the re-init guard never re-enters in tests. */
  if (consoleSymbols === undefined) {
    consoleSymbols = ObjectGetOwnPropertySymbols(globalConsole)
  }
  /* c8 ignore stop */
  return consoleSymbols
}

/**
 * Lazily get kGroupIndentationWidth symbol on first access.
 */
export function getKGroupIndentationWidthSymbol(): symbol {
  /* c8 ignore next - Lazy-init second-call branch; module-singleton. */
  if (kGroupIndentationWidthSymbol === undefined) {
    kGroupIndentationWidthSymbol =
      getConsoleSymbols().find(
        s =>
          (s as { label?: string | undefined }).label === 'kGroupIndentWidth',
      ) ?? Symbol('kGroupIndentWidth')
  }
  return kGroupIndentationWidthSymbol
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

export const LOG_SYMBOLS = /*@__PURE__*/ createLogSymbols()
