/**
 * @file Public type surface for `words/*` modules — the `PluralizeOptions`
 *   record and its `PluralForms` companion. Pure types, no runtime side
 *   effects.
 */

/**
 * Count-aware forms for {@link pluralize}. `singular` covers the CLDR `one`
 * category; `plural` covers the required `other` category and is the fallback
 * when a count's category isn't explicitly listed. The remaining four
 * (`zero`/`two`/`few`/`many`) are optional and default to `plural` when omitted
 * — only languages like Arabic, Russian, or Welsh exercise them.
 *
 * Plural-category reference:
 * https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules/select
 * https://cldr.unicode.org/index/cldr-spec/plural-rules.
 */
export interface PluralForms {
  singular?: string | undefined
  plural: string
  zero?: string | undefined
  two?: string | undefined
  few?: string | undefined
  many?: string | undefined
}

export interface PluralizeOptions {
  count?: number | undefined
  forms?: PluralForms | undefined
  // BCP 47 locale tag (e.g. 'en-US', 'ar', 'ru'). Used only when
  // `forms` is given. Defaults to 'en-US'.
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/Locale
  locale?: string | undefined
  // 'cardinal' (1 file, 2 files) vs. 'ordinal' (1st, 2nd, 3rd).
  // https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules/PluralRules#type
  type?: Intl.PluralRuleType | undefined
}
