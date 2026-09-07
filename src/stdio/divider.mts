/**
 * @file Console divider and separator utilities. Provides various line styles
 *   for visual separation in CLI output.
 */

import { getDefaultLogger } from '../logger/default.mjs'
import { repeatString } from '../strings/format.mjs'

const logger = getDefaultLogger()

export interface DividerOptions {
  /**
   * Width of the divider line in characters.
   *
   * @default 55
   */
  width?: number | undefined
  /**
   * Character to repeat for the divider line.
   *
   * @default '═'
   */
  char?: string | undefined
  /**
   * Optional color function to apply to the divider. Accepts a function from
   * `yoctocolors` or similar.
   */
  color?: ((text: string) => string) | undefined
}

/**
 * Create a divider line with custom character and width. Returns a string of
 * repeated characters for visual separation.
 *
 * @example
 *   ;```ts
 *   console.log(divider()) // Default: 55 '═' characters
 *   console.log(divider({ char: '-', width: 40 }))
 *   console.log(divider({ char: '·', width: 30 }))
 *   ```
 *
 * @param options - Divider formatting options.
 *
 * @returns Divider string
 */
export function divider(options?: DividerOptions | undefined): string {
  const opts = { __proto__: null, ...options } as DividerOptions
  const { char = '═', width = 55 } = opts
  return repeatString(char, width)
}

/**
 * Common divider style presets. Provides quick access to popular divider
 * styles.
 *
 * @example
 *   ;```ts
 *   console.log(dividers.thick()) // ═══════...
 *   console.log(dividers.thin()) // ───────...
 *   console.log(dividers.dotted()) // ·······...
 *   ```
 */
export const dividers = {
  arrow: () => divider({ char: '→' }),
  dashed: () => divider({ char: '╌' }),
  diamond: () => divider({ char: '◆' }),
  dotted: () => divider({ char: '·' }),
  double: () => divider({ char: '═' }),
  single: () => divider({ char: '-' }),
  star: () => divider({ char: '*' }),
  thick: () => divider({ char: '═' }),
  thin: () => divider({ char: '─' }),
  wave: () => divider({ char: '~' }),
} as const

/**
 * Print a divider line directly to console.
 *
 * @example
 *   ;```ts
 *   printDivider() // Prints default divider
 *   printDivider({ char: '─', width: 60 })
 *   ```
 *
 * @param options - Divider formatting options.
 */
export function printDivider(options?: DividerOptions | undefined): void {
  logger.log(divider(options))
}

/**
 * Print a dotted divider line. Convenience function using `·` character.
 *
 * @example
 *   ;```ts
 *   printDottedDivider()
 *   // ·······················································
 *   ```
 */
export function printDottedDivider(): void {
  printDivider({ char: '·' })
}

/**
 * Print a section break with spacing directly to console.
 *
 * @example
 *   ;```ts
 *   console.log('Previous section')
 *   printSectionBreak()
 *   console.log('Next section')
 *   ```
 *
 * @param options - Divider formatting options.
 */
export function printSectionBreak(options?: DividerOptions | undefined): void {
  logger.log(sectionBreak(options))
}

/**
 * Print a thick divider line, the default style. Convenience function using `═`
 * character.
 *
 * @example
 *   ;```ts
 *   printThickDivider()
 *   // ═══════════════════════════════════════════════════
 *   ```
 */
export function printThickDivider(): void {
  printDivider({ char: '═' })
}

/**
 * Print a thin divider line. Convenience function using `─` character.
 *
 * @example
 *   ;```ts
 *   printThinDivider()
 *   // ───────────────────────────────────────────────────
 *   ```
 */
export function printThinDivider(): void {
  printDivider({ char: '─' })
}

/**
 * Create a section break with blank lines before and after the divider. Useful
 * for creating visual separation between major sections.
 *
 * @example
 *   ;```ts
 *   console.log('Previous section')
 *   console.log(sectionBreak())
 *   console.log('Next section')
 *   // Output:
 *   // Previous section
 *   //
 *   // ═══════════════════════════════════════════════════
 *   //
 *   // Next section
 *   ```
 *
 * @param options - Divider formatting options.
 *
 * @returns Section break string with newlines
 */
export function sectionBreak(options?: DividerOptions | undefined): string {
  const div = divider(options)
  return `\n${div}\n`
}
