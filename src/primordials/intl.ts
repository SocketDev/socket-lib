/**
 * @file Safe references to `Intl` constructors. Captured once at module load so
 *   consumers reading adversarial input never see a tampered global. `new
 *   Intl.X(...)` is expensive (10-14ms for Collator in Node); callers are
 *   responsible for caching instances — these exports are the constructors
 *   only. On the smol Node binary the captures come from `node:smol-primordial`
 *   (which hoists them from within the sealed module context); on stock Node
 *   they fall back to the global `Intl` object.
 */

import { getSmolPrimordial } from '../smol/primordial'

const smolPrimordial = getSmolPrimordial()

export const IntlCollator: typeof Intl.Collator =
  smolPrimordial?.IntlCollator ?? Intl.Collator
export const IntlListFormat: typeof Intl.ListFormat =
  smolPrimordial?.IntlListFormat ?? Intl.ListFormat
export const IntlPluralRules: typeof Intl.PluralRules =
  smolPrimordial?.IntlPluralRules ?? Intl.PluralRules
export const IntlSegmenter: typeof Intl.Segmenter =
  smolPrimordial?.IntlSegmenter ?? Intl.Segmenter
