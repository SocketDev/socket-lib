/**
 * @fileoverview Color conversion helpers — `isRgbTuple()` narrows a
 * `ColorValue` to the RGB-tuple branch, and `toRgb()` resolves a
 * named color or passes through an existing tuple.
 */

import { ArrayIsArray } from '../primordials/array'

import { colorToRgb } from './palette'

import type { ColorRgb, ColorValue } from './types'

/**
 * Type guard to check if a color value is an RGB tuple.
 * @param value - Color value to check
 * @returns `true` if value is an RGB tuple, `false` if it's a color name
 *
 * @example
 * ```typescript
 * isRgbTuple([255, 0, 0]) // true
 * isRgbTuple('red')       // false
 * ```
 */
export function isRgbTuple(value: ColorValue): value is ColorRgb {
  return ArrayIsArray(value)
}

/**
 * Convert a color value to RGB tuple format.
 * Named colors are looked up in the `colorToRgb` map, RGB tuples are returned as-is.
 * @param color - Color name or RGB tuple
 * @returns RGB tuple with values 0-255
 *
 * @example
 * ```typescript
 * toRgb('red')       // [255, 0, 0]
 * toRgb([0, 128, 0]) // [0, 128, 0]
 * ```
 */
export function toRgb(color: ColorValue): ColorRgb {
  if (isRgbTuple(color)) {
    return color
  }
  return colorToRgb[color]
}
