/**
 * @file Pure helpers extracted from the Socket `Spinner` class body: option
 *   parsing (theme/color resolution, shimmer config) and the shimmer rendering
 *   pass. Keeping these side-effect-free and outside the class keeps the class
 *   module focused on method wiring and under the file-size cap.
 */

import type { ColorInherit, ColorRgb, ColorValue } from '../colors/types'
import { isRgbTuple, toRgb } from '../colors/convert'
import type {
  Palette,
  ShimmerConfig,
  ShimmerDirection,
  ShimmerSpec,
} from '../effects/shimmer'
import { configToSpec, frameColors } from '../effects/shimmer'
import { colorsToAnsi } from '../effects/shimmer-terminal'
import { getCI } from '../env/ci'
import { ArrayIsArray } from '../primordials/array'
import { TypeErrorCtor } from '../primordials/error'
import { getTheme } from '../themes/context'
import { THEMES } from '../themes/themes'
import { resolveColor } from '../themes/resolve'

import { COLOR_INHERIT } from './format'

import type { ShimmerInfo, SpinnerOptions } from './types'

/**
 * Apply the shimmer effect to display text. Mutates the shimmer frame counter
 * as it advances. Skips work in CI or when the direction is 'none'.
 *
 * @param displayText - Text to colorize.
 * @param shimmer - Mutable shimmer state (frame counter is advanced).
 * @param currentColor - The spinner's current RGB color (used for inherit).
 *
 * @returns Colorized text, or the input unchanged when shimmer is skipped.
 */
export function applyShimmer(
  displayText: string,
  shimmer: ShimmerInfo,
  currentColor: ColorRgb,
): string {
  let shimmerColor: ColorRgb | Palette
  if (shimmer.color === COLOR_INHERIT) {
    shimmerColor = currentColor
  } else if (ArrayIsArray(shimmer.color[0])) {
    shimmerColor = shimmer.color as Palette
  } else {
    shimmerColor = toRgb(shimmer.color as ColorValue)
  }

  if (!getCI() && shimmer.direction !== 'none') {
    const chars = [...displayText]
    const spec: ShimmerSpec = configToSpec(
      {
        color: shimmerColor,
        dir: shimmer.direction,
        speed: shimmer.speed,
      },
      chars.length,
    )
    const colors = frameColors(spec, chars.length, shimmer.frame)
    // eslint-disable-next-line no-param-reassign
    shimmer.frame++
    return colorsToAnsi(displayText, colors)
  }
  return displayText
}

/**
 * Parse the shimmer option (object or direction string) into a `ShimmerInfo`.
 *
 * @param shimmer - The `shimmer` option value.
 *
 * @returns Parsed shimmer state, or undefined when shimmer is disabled.
 */
export function parseShimmerOption(
  shimmer: SpinnerOptions['shimmer'],
): ShimmerInfo | undefined {
  if (!shimmer) {
    return undefined
  }
  let shimmerDir: ShimmerDirection
  let shimmerColor: ColorInherit | ColorValue | Palette
  // Default: 0.33 steps per frame (~150ms per step).
  let shimmerSpeed: number = 1 / 3

  if (typeof shimmer === 'string') {
    shimmerDir = shimmer
    shimmerColor = COLOR_INHERIT
  } else {
    const shimmerConfig = {
      __proto__: null,
      ...shimmer,
    } as ShimmerConfig
    shimmerDir = shimmerConfig.dir ?? 'ltr'
    shimmerColor =
      (shimmerConfig.color as
        | ColorInherit
        | ColorValue
        | Palette
        | undefined) ?? COLOR_INHERIT
    shimmerSpeed = shimmerConfig.speed ?? 1 / 3
  }

  return {
    __proto__: null,
    color: shimmerColor,
    direction: shimmerDir,
    speed: shimmerSpeed,
    frame: 0,
  } as ShimmerInfo
}

/**
 * Resolve the spinner's RGB color from options and the active theme. Validates
 * RGB tuples and falls back to the theme's primary color.
 *
 * @param opts - Normalized spinner options.
 *
 * @returns Resolved RGB color tuple.
 */
export function resolveSpinnerColorRgb(options: SpinnerOptions): ColorRgb {
  // Get theme from options or current theme.
  options = { __proto__: null, ...options } as typeof options
  let theme = getTheme()
  if (options.theme) {
    // Resolve theme name or use Theme object directly.
    if (typeof options.theme === 'string') {
      theme = THEMES[options.theme] ?? theme
    } else {
      theme = options.theme
    }
  }

  // Get default color from theme if not specified.
  let defaultColor: ColorValue = theme.colors.primary
  if (theme.effects?.spinner?.color) {
    const resolved = resolveColor(theme.effects.spinner.color, theme.colors)
    // resolveColor can return 'inherit' or gradients which aren't valid for a
    // spinner; fall back to primary for these cases.
    if (resolved === 'inherit' || ArrayIsArray(resolved[0])) {
      defaultColor = theme.colors.primary
    } else {
      defaultColor = resolved as ColorValue
    }
  }

  // Convert color option to RGB (default from theme).
  const spinnerColor = options.color ?? defaultColor

  // Validate RGB tuple if provided.
  if (
    isRgbTuple(spinnerColor) &&
    (spinnerColor.length !== 3 ||
      !spinnerColor.every(n => typeof n === 'number' && n >= 0 && n <= 255))
  ) {
    throw new TypeErrorCtor(
      'RGB color must be an array of 3 numbers between 0 and 255',
    )
  }

  return toRgb(spinnerColor)
}
