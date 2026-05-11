/**
 * @fileoverview Named-color palette — maps each `ColorName` to its
 * canonical RGB tuple. Consumed by `colors/convert` and surfaced to
 * downstream renderers (shimmer, gradient, pulse) that need numeric
 * channel values for color blending.
 */

import type { ColorName, ColorRgb } from './types'

export const colorToRgb: Record<ColorName, ColorRgb> = {
  __proto__: null,
  black: [0, 0, 0],
  blue: [0, 0, 255],
  blueBright: [100, 149, 237],
  cyan: [0, 255, 255],
  cyanBright: [0, 255, 255],
  gray: [128, 128, 128],
  green: [0, 128, 0],
  greenBright: [0, 255, 0],
  magenta: [255, 0, 255],
  magentaBright: [255, 105, 180],
  red: [255, 0, 0],
  redBright: [255, 69, 0],
  white: [255, 255, 255],
  whiteBright: [255, 255, 255],
  yellow: [255, 255, 0],
  yellowBright: [255, 255, 153],
} as Record<ColorName, ColorRgb>
