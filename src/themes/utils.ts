/**
 * @fileoverview Theme utility functions for color resolution and theme manipulation.
 */

import { RAINBOW_GRADIENT } from '../effects/ultra'
import type { ColorValue } from '../spinner'
import type { ShimmerColorGradient } from '../effects/text-shimmer'
import type { Theme, ThemeColors, ColorReference } from './types'

/**
 * Resolve a color reference to an actual ColorValue.
 * Handles special references like 'primary', 'secondary', 'rainbow', 'inherit'.
 *
 * @param value - Color reference to resolve
 * @param colors - Theme colors to resolve references against
 * @returns Resolved color value
 *
 * @example
 * ```ts
 * resolveColor('primary', theme.colors)  // Returns theme.colors.primary
 * resolveColor('red', theme.colors)      // Returns 'red'
 * resolveColor([255, 0, 0], theme.colors) // Returns [255, 0, 0]
 * ```
 */
export function resolveColor(
  value: ColorReference | ColorValue,
  colors: ThemeColors,
): ColorValue | 'inherit' | ShimmerColorGradient {
  if (typeof value === 'string') {
    if (value === 'primary') {
      return colors.primary
    }
    if (value === 'secondary') {
      return colors.secondary ?? colors.primary
    }
    if (value === 'inherit') {
      return 'inherit'
    }
    if (value === 'rainbow') {
      return RAINBOW_GRADIENT
    }
    // Otherwise it's a ColorName like 'red', 'cyan'
    return value as ColorValue
  }
  return value as ColorValue
}

/**
 * Resolve shimmer color configuration, handling gradients and special keywords.
 *
 * @param value - Shimmer color value to resolve
 * @param theme - Theme to resolve against
 * @returns Resolved shimmer color (single, gradient, or 'inherit')
 *
 * @example
 * ```ts
 * resolveShimmerColor('rainbow', theme)    // Returns RAINBOW_GRADIENT
 * resolveShimmerColor('primary', theme)    // Returns theme.colors.primary
 * resolveShimmerColor('inherit', theme)    // Returns 'inherit'
 * ```
 */
export function resolveShimmerColor(
  value: ColorReference | ColorValue[] | undefined,
  theme: Theme,
): ColorValue | ShimmerColorGradient | 'inherit' {
  if (!value) {
    return 'inherit'
  }
  if (value === 'rainbow') {
    return RAINBOW_GRADIENT
  }
  if (value === 'inherit') {
    return 'inherit'
  }
  if (Array.isArray(value)) {
    if (value.length > 0 && Array.isArray(value[0])) {
      // Gradient
      return value as ShimmerColorGradient
    }
    // Single RGB
    return value as unknown as ColorValue
  }
  return resolveColor(value as ColorReference, theme.colors)
}

/**
 * Create a custom theme by extending an existing theme with overrides.
 * Performs a deep merge of colors and effects.
 *
 * @param base - Base theme to extend
 * @param overrides - Partial theme overrides
 * @returns New theme with merged properties
 *
 * @example
 * ```ts
 * const myTheme = extendTheme(SOCKET_THEME, {
 *   name: 'my-theme',
 *   colors: {
 *     primary: [255, 100, 200]  // Override primary color
 *   }
 * })
 * ```
 */
export function extendTheme(
  base: Theme,
  overrides: Partial<Omit<Theme, 'colors'>> & {
    colors?: Partial<ThemeColors> | undefined
  },
): Theme {
  return {
    __proto__: null,
    ...base,
    ...overrides,
    colors: {
      __proto__: null,
      ...base.colors,
      ...overrides.colors,
    } as ThemeColors,
    effects: overrides.effects
      ? {
          __proto__: null,
          ...base.effects,
          ...overrides.effects,
          spinner:
            overrides.effects.spinner !== undefined
              ? {
                  __proto__: null,
                  ...base.effects?.spinner,
                  ...overrides.effects.spinner,
                }
              : base.effects?.spinner,
          shimmer:
            overrides.effects.shimmer !== undefined
              ? {
                  __proto__: null,
                  ...base.effects?.shimmer,
                  ...overrides.effects.shimmer,
                }
              : base.effects?.shimmer,
          pulse:
            overrides.effects.pulse !== undefined
              ? {
                  __proto__: null,
                  ...base.effects?.pulse,
                  ...overrides.effects.pulse,
                }
              : base.effects?.pulse,
        }
      : base.effects,
    meta: overrides.meta
      ? {
          __proto__: null,
          ...base.meta,
          ...overrides.meta,
        }
      : base.meta,
  } as Theme
}

/**
 * Create a new theme from scratch with sensible defaults.
 *
 * @param config - Theme configuration
 * @returns Complete theme object
 *
 * @example
 * ```ts
 * const theme = createTheme({
 *   name: 'my-theme',
 *   displayName: 'My Theme',
 *   colors: {
 *     primary: [255, 100, 200],
 *     success: 'green',
 *     error: 'red',
 *     warning: 'yellow',
 *     info: 'blue',
 *     step: 'cyan',
 *     text: 'white',
 *     textDim: 'gray',
 *     link: 'cyan',
 *     prompt: 'primary'
 *   }
 * })
 * ```
 */
export function createTheme(
  config: Pick<Theme, 'name' | 'displayName' | 'colors'> &
    Partial<Omit<Theme, 'name' | 'displayName' | 'colors'>>,
): Theme {
  return {
    __proto__: null,
    name: config.name,
    displayName: config.displayName,
    colors: { __proto__: null, ...config.colors } as ThemeColors,
    effects: config.effects
      ? { __proto__: null, ...config.effects }
      : undefined,
    meta: config.meta ? { __proto__: null, ...config.meta } : undefined,
  } as Theme
}
