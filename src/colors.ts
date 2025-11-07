/**
 * @fileoverview Color utilities for RGB color conversion and manipulation.
 * Provides type-safe color handling with named colors and RGB tuples.
 */

/**
 * Named color values supported by the library.
 * Maps to standard terminal colors with bright variants.
 */
export type ColorName =
  | 'black'
  | 'blue'
  | 'blueBright'
  | 'cyan'
  | 'cyanBright'
  | 'gray'
  | 'green'
  | 'greenBright'
  | 'magenta'
  | 'magentaBright'
  | 'red'
  | 'redBright'
  | 'white'
  | 'whiteBright'
  | 'yellow'
  | 'yellowBright'

/**
 * Special 'inherit' color value that uses the current color context.
 * Used with effects like shimmer to dynamically inherit color.
 */
export type ColorInherit = 'inherit'

/**
 * RGB color tuple with values 0-255 for red, green, and blue channels.
 * @example [140, 82, 255] // Socket purple
 * @example [255, 0, 0]    // Red
 */
export type ColorRgb = readonly [number, number, number]

/**
 * Union of all supported color types: named colors or RGB tuples.
 */
export type ColorValue = ColorName | ColorRgb

// Map color names to RGB values.
const colorToRgb: Record<ColorName, ColorRgb> = {
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

/**
 * Type guard to check if a color value is an RGB tuple.
 * @param value - Color value to check
 * @returns `true` if value is an RGB tuple, `false` if it's a color name
 */
export function isRgbTuple(value: ColorValue): value is ColorRgb {
  return Array.isArray(value)
}

/**
 * Convert a color value to RGB tuple format.
 * Named colors are looked up in the `colorToRgb` map, RGB tuples are returned as-is.
 * @param color - Color name or RGB tuple
 * @returns RGB tuple with values 0-255
 */
export function toRgb(color: ColorValue): ColorRgb {
  if (isRgbTuple(color)) {
    return color
  }
  return colorToRgb[color]
}
