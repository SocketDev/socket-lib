/**
 * @fileoverview Theme type definitions for Socket libraries.
 * Provides type-safe theming across spinners, logger, prompts, and links.
 */

import type { ColorValue } from '../spinner'
import type { ShimmerDirection } from '../effects/text-shimmer'
import type { SpinnerStyle } from '../spinner'

/**
 * Color reference that can be a direct color value or a reference to a theme color.
 * Special values: 'primary', 'secondary', 'inherit', 'rainbow'
 */
export type ColorReference =
  | ColorValue
  | 'primary'
  | 'secondary'
  | 'inherit'
  | 'rainbow'

/**
 * Theme color palette defining all semantic and UI colors.
 */
export type ThemeColors = {
  /** Primary brand color */
  primary: ColorValue
  /** Secondary/accent brand color */
  secondary?: ColorValue | undefined

  /** Success/completion color (✓) */
  success: ColorValue
  /** Error/failure color (✗) */
  error: ColorValue
  /** Warning/caution color (⚠) */
  warning: ColorValue
  /** Information color (ℹ) */
  info: ColorValue
  /** Step/progress color (→) */
  step: ColorValue

  /** Default text color */
  text: ColorValue
  /** Dimmed/secondary text color */
  textDim: ColorValue
  /** Hyperlink color (can reference 'primary', 'secondary') */
  link: ColorReference
  /** Interactive prompt color (can reference 'primary', 'secondary') */
  prompt: ColorReference
}

/**
 * Theme effects configuration for animations and visual enhancements.
 */
export type ThemeEffects = {
  /** Spinner-specific configuration */
  spinner?: {
    /** Spinner color (can reference theme colors via 'primary'/'secondary') */
    color?: ColorReference | undefined
    /** Spinner animation style name or definition */
    style?: SpinnerStyle | string | undefined
  }

  /** Shimmer effect configuration */
  shimmer?: {
    /** Enable shimmer animations */
    enabled?: boolean | undefined
    /** Shimmer color (single, gradient, or special keywords) */
    color?: ColorReference | ColorValue[] | undefined
    /** Shimmer direction */
    direction?: ShimmerDirection | undefined
    /** Animation speed (steps per frame) */
    speed?: number | undefined
  }

  /** Pulse animation configuration */
  pulse?: {
    /** Pulse animation speed in milliseconds */
    speed?: number | undefined
  }
}

/**
 * Theme metadata (optional descriptive information).
 */
export type ThemeMeta = {
  /** Human-readable description of the theme */
  description?: string | undefined
  /** Theme author/maintainer */
  author?: string | undefined
  /** Theme version */
  version?: string | undefined
}

/**
 * Complete theme definition.
 */
export type Theme = {
  /** Unique theme identifier (kebab-case) */
  name: string
  /** Human-readable display name */
  displayName: string

  /** Color palette */
  colors: ThemeColors

  /** Visual effects configuration (optional) */
  effects?: ThemeEffects | undefined

  /** Metadata (optional) */
  meta?: ThemeMeta | undefined
}
