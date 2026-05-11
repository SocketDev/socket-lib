/**
 * @fileoverview Public type surface for `links/*` modules — the
 * `LinkOptions` record. Pure types, no runtime side effects.
 */

import type { ThemeName } from '../themes/themes'
import type { Theme } from '../themes/types'

/**
 * Options for creating themed links.
 */
export type LinkOptions = {
  /** Theme to use (overrides global) */
  theme?: Theme | ThemeName | undefined
  /** Show URL as fallback if terminal doesn't support links */
  fallback?: boolean | undefined
}
