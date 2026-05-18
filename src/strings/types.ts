/**
 * @file Public type surface for `strings/*` modules — branded string types and
 *   option interfaces. Pure types, no runtime side effects.
 */

declare const BlankStringBrand: unique symbol
export type BlankString = string & { [BlankStringBrand]: true }

declare const EmptyStringBrand: unique symbol
export type EmptyString = string & { [EmptyStringBrand]: true }

export interface ApplyLinePrefixOptions {
  /**
   * The prefix to add to each line.
   *
   * @default ''
   */
  prefix?: string | undefined
}

export interface IndentStringOptions {
  /**
   * Number of spaces to indent each line.
   *
   * @default 1
   */
  count?: number | undefined
}

export interface SearchOptions {
  /**
   * The position in the string to begin searching from. Negative values count
   * back from the end of the string.
   *
   * @default 0
   */
  fromIndex?: number | undefined
}
