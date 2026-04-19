/**
 * Zod locales stub.
 *
 * Zod eagerly requires `zod/v4/locales/index.cjs` from its core module,
 * which in turn pulls in 39+ per-language locale files. Callers who want
 * localization opt in via `z.config(z.locales.en())`; we never do.
 *
 * Exporting an empty object lets the `exports.locales = ...` assignment
 * in zod/v4/core/index.cjs succeed; any stray `z.locales.xx()` call
 * would throw TypeError, which is acceptable since we don't use it.
 */
'use strict'

module.exports = {}
