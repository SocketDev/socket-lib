/**
 * @file Pure helpers extracted from the Socket `Spinner` class body: option
 *   parsing (theme/color resolution, shimmer config) and the shimmer rendering
 *   pass. Keeping these side-effect-free and outside the class keeps the class
 *   module focused on method wiring and under the file-size cap.
 */

import type {
  ColorInherit,
  ColorRgb,
  ColorValue,
} from '../term/colors/types.mjs'
import { isRgbTuple, toRgb } from '../term/colors/convert.mjs'
import type {
  Palette,
  ShimmerConfig,
  ShimmerDirection,
  ShimmerSpec,
} from '../term/effects/shimmer.mjs'
import { configToSpec, frameColors } from '../term/effects/shimmer.mjs'
import { colorsToAnsi } from '../term/effects/shimmer-terminal.mjs'
import { isAgent } from '../env/agents.mjs'
import { isCI } from '../env/ci.mjs'
import { ArrayIsArray } from '../primordials/array.mjs'
import { TypeErrorCtor } from '../primordials/error.mjs'
import { getTheme } from '../term/themes/context.mjs'
import { THEMES } from '../term/themes/themes.mjs'
import { resolveColor } from '../term/themes/resolve.mjs'

import { COLOR_INHERIT } from './format.mjs'

import type { ShimmerInfo, SpinnerOptions } from './types.mjs'

/**
 * Apply the shimmer effect to display text. Mutates the shimmer frame counter
 * as it advances. Skips work in CI or when the direction is 'none'.
 *
 * @param displayText - Text to colorize.
 * @param shimmer - Mutable shimmer state whose frame counter is advanced.
 * @param currentColor - The spinner's current RGB color, used for inherit.
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

  // Shimmer is a per-frame animation: skip it for CI logs and AI-agent-driven
  // runs, where the frames land in a transcript instead of a terminal.
  if (!isCI() && !isAgent() && shimmer.direction !== 'none') {
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
    shimmer.frame++
    return colorsToAnsi(displayText, colors)
  }
  return displayText
}

/**
 * Parse the shimmer option, an object or a direction string, into a
 * `ShimmerInfo`.
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

  // Convert color option to RGB, defaulting to the theme color.
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
