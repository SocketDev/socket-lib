/**
 * @file Count-based pluralization. Two modes:
 *
 *   - Default: appends a trailing `'s'` when the count is anything other than 1.
 *     Zero-cost; no Intl dependency on the hot path.
 *   - Dictionary: when `options.forms` is given, selects from a caller-supplied
 *     dictionary of forms keyed by plural category. Honors locale + cardinal /
 *     ordinal via `Intl.PluralRules`. Required `plural` acts as the fallback
 *     for any category not explicitly listed.
 */

import type { PluralForms, PluralizeOptions } from './types'

// CLDR (Common Locale Data Repository) is the Unicode Consortium's
// database of locale data: https://cldr.unicode.org/. The plural-
// category strings — zero/one/two/few/many/other — come from LDML
// (Locale Data Markup Language, UTS-35), the XML schema CLDR uses;
// see Intl.LDMLPluralRule, which TypeScript names after the spec.
// Runtime API:
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules/select
const CLDR_TO_FIELD: Record<Intl.LDMLPluralRule, keyof PluralForms> = {
  few: 'few',
  many: 'many',
  one: 'singular',
  other: 'plural',
  two: 'two',
  zero: 'zero',
}

// Per-locale-and-type cache. `new Intl.PluralRules(...)` is
// measurably slow on first call in Node (10ms+); a Map keyed on
// `<locale>:<type>` keeps every distinct config to a single
// construction across the lifetime of the process. Same pattern
// the lib uses for Intl.ListFormat (arrays/_internal.ts) and
// Intl.Collator (sorts/natural.ts), extended to a multi-key cache
// because pluralize accepts per-call locale + cardinal/ordinal.
// https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules/PluralRules
const RULES_CACHE = new Map<string, Intl.PluralRules>()

export function getRules(
  locale: string,
  type: Intl.PluralRuleType,
): Intl.PluralRules {
  const key = `${locale}:${type}`
  let r = RULES_CACHE.get(key)
  if (!r) {
    r = new Intl.PluralRules(locale, { type })
    RULES_CACHE.set(key, r)
  }
  return r
}

/**
 * Pluralize a word based on count.
 *
 * @example
 *   ;```typescript
 *   pluralize('file') // 'file'
 *   pluralize('file', { count: 3 }) // 'files'
 *   pluralize('file', { count: 0 }) // 'files'
 *
 *   // Dictionary mode for irregulars.
 *   pluralize('child', {
 *   count: 3,
 *   forms: { singular: 'child', plural: 'children' },
 *   }) // 'children'
 *
 *   // Locale + cardinal/ordinal. `singular` here covers CLDR's `one`
 *   // category (the count===1 ordinal suffix); `two`/`few` map directly;
 *   // `plural` is the fallback for everything else.
 *   pluralize('place', {
 *   count: 2,
 *   type: 'ordinal',
 *   forms: { singular: 'st', two: 'nd', few: 'rd', plural: 'th' },
 *   }) // 'nd'
 *   ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function pluralize(
  word: string,
  options?: PluralizeOptions | undefined,
): string {
  const opts = { __proto__: null, ...options } as PluralizeOptions
  const { count = 1, forms, locale = 'en-US', type = 'cardinal' } = opts

  if (forms) {
    const category = getRules(locale, type).select(count)
    return forms[CLDR_TO_FIELD[category]] ?? forms.plural
  }

  return count === 1 ? word : `${word}s`
}
