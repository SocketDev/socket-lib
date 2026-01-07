/**
 * Picomatch options for glob pattern matching.
 */
export interface PicomatchOptions {
  /**
   * When true, the glob will match the basename of the path.
   * @default false
   */
  basename?: boolean

  /**
   * When true, the glob will match case-insensitively.
   * @default false
   */
  nocase?: boolean

  /**
   * When true, allow matching dotfiles (files starting with '.').
   * @default false
   */
  dot?: boolean

  /**
   * Glob patterns to ignore.
   */
  ignore?: string | string[]

  /**
   * When true, a leading '!' will negate the glob.
   * @default true
   */
  negate?: boolean

  /**
   * When true, match against Windows paths.
   * Defaults to os.platform() === 'win32'.
   */
  windows?: boolean

  /**
   * When true, convert backslashes to forward slashes in paths.
   * @default true on Windows
   */
  normalize?: boolean

  /**
   * Function to call on each match result.
   */
  onMatch?: (result: unknown) => void

  /**
   * Function to call on each result.
   */
  onResult?: (result: unknown) => void

  /**
   * Format function for transforming paths.
   */
  format?: (input: string) => string
}

/**
 * Matcher function returned by picomatch.
 * Tests if a string matches the glob pattern.
 */
export type Matcher = (input: string) => boolean

/**
 * Creates a matcher function from a glob pattern.
 * The returned function takes a string to match as its argument.
 *
 * @param pattern - Glob pattern to match against
 * @param options - Picomatch options
 * @returns Matcher function that tests strings against the pattern
 *
 * @example
 * ```ts
 * import picomatch from './external/picomatch.js'
 *
 * const isMatch = picomatch('*.js')
 * isMatch('test.js') // true
 * isMatch('test.ts') // false
 * ```
 */
declare function picomatch(
  pattern: string | string[],
  options?: PicomatchOptions,
): Matcher

export default picomatch
