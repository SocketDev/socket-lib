/**
 * @fileoverview Public type surface for `colors/*` modules — the
 * `ColorInherit` literal, the `ColorName` named-color union, the
 * `ColorRgb` tuple, and the `ColorValue` super-union. Pure types,
 * no runtime side effects.
 */

/**
 * Special 'inherit' color value that uses the current color context.
 * Used with effects like shimmer to dynamically inherit color.
 */
export type ColorInherit = 'inherit'

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
 * RGB color tuple with values 0-255 for red, green, and blue channels.
 * @example [140, 82, 255] // Socket purple
 * @example [255, 0, 0]    // Red
 */
export type ColorRgb = readonly [number, number, number]

/**
 * Union of all supported color types: named colors or RGB tuples.
 */
export type ColorValue = ColorName | ColorRgb
