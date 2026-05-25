/**
 * @file Free-function helpers for per-instance log-symbol construction + symbol
 *   stripping. Extracted from `logger/node.ts` (the `Logger` class) so the
 *   class stays under the 1000-line hard cap and so other callers (alt loggers,
 *   format helpers) can reuse the same logic without instantiating a `Logger`.
 *
 *   - `buildLoggerSymbols` — theme + unicode-detection → `LogSymbols` map
 *   - `stripLoggerSymbols` — strip leading status emoji from a string
 */

/* oxlint-disable socket/no-status-emoji */
// The `buildLoggerSymbols` factory below assembles the canonical
// symbol map used by `logger.success` / `logger.fail` / `logger.warn`
// etc. This module IS the source of those symbols, so the rule that
// recommends `logger.<method>` instead of raw emoji doesn't apply
// here.

import isUnicodeSupported from '../external/@socketregistry/is-unicode-supported'

import { StringPrototypeReplace } from '../primordials/string'

import { applyColor, getYoctocolors } from './colors'

import type { LogSymbols } from './types'
import type { Theme } from '../themes/types'

/**
 * Build a `LogSymbols` map for the given theme.
 *
 * On unicode-supporting terminals returns the canonical icons (`✔`, `✖`, `⚠`,
 * `ℹ`, `→`, `∴`, `↻`); otherwise returns ASCII fallbacks (`√`, `×`, `‼`, `i`,
 * `>`, `:.`, `@`). Colors are pulled from the supplied theme via `applyColor`.
 */
export function buildLoggerSymbols(theme: Theme): LogSymbols {
  const supported = isUnicodeSupported()
  const colors = getYoctocolors()

  /* c8 ignore start - ASCII-fallback symbol arms only fire on
     terminals without unicode support; tests run on unicode TTYs. */
  return {
    __proto__: null,
    fail: applyColor(supported ? '✖' : '×', theme.colors.error, colors),
    info: applyColor(supported ? 'ℹ' : 'i', theme.colors.info, colors),
    progress: applyColor(supported ? '∴' : ':.', theme.colors.step, colors),
    skip: applyColor(supported ? '↻' : '@', theme.colors.step, colors),
    step: applyColor(supported ? '→' : '>', theme.colors.step, colors),
    success: applyColor(supported ? '✔' : '√', theme.colors.success, colors),
    warn: applyColor(supported ? '⚠' : '‼', theme.colors.warning, colors),
  } as LogSymbols
  /* c8 ignore stop */
}

/**
 * Strip leading log-status symbols (and variation selectors) from a string.
 * Matches both unicode forms (`✖`, `⚠`, `✔`, `ℹ`, `→`, `∴`, `↻`) and the
 * unambiguous ASCII fallback `:.`. Does not strip lone ASCII letters (`i`, `>`,
 * `@`) since those would mangle real words.
 *
 * Handles the trailing variation-selector U+FE0F + whitespace so a `'✔ Done'`
 * input becomes `'Done'`.
 */
export function stripLoggerSymbols(text: string): string {
  return StringPrototypeReplace(text, /^(?:[✖✗×⚠‼✔✓√ℹ→∴↻]|:.)[️\s]*/u, '')
}
