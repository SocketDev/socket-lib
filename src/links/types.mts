/**
 * @file Public type surface for `links/*` modules — the `LinkOptions` record.
 *   Pure types, no runtime side effects.
 */

import type { ThemeName } from '../term/themes/themes.mjs'
import type { Theme } from '../term/themes/types.mjs'

/**
 * Options for creating themed links.
 */
export type LinkOptions = {
  /**
   * Theme to use, overriding the global theme.
   */
  theme?: Theme | ThemeName | undefined
  /**
   * Show URL as fallback if terminal doesn't support links.
   */
  fallback?: boolean | undefined
}
