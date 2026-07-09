/**
 * @file Standard error stream utilities. Provides utilities for writing to
 *   stderr with formatting and control.
 */

import process from 'node:process'

import {
  clearLineOn,
  cursorToOn,
  getColumnsOf,
  getRowsOf,
  isTTYOf,
} from './_internal'

// Get the actual stderr stream.
// oxlint-disable-next-line socket/no-module-eval-side-effects -- the raw stream IS this module's public API (`export { stderr }` below); lazifying is a breaking contract change.
const stderr: NodeJS.WriteStream = process.stderr

/**
 * Clear the current line on stderr. Only works in TTY environments.
 *
 * @example
 *   ;```ts
 *   writeError('Processing...')
 *   clearLine()
 *   writeError('Done!')
 *   ```
 */
export function clearLine(): void {
  clearLineOn(stderr)
}

/**
 * Move cursor to specific position on stderr. Only works in TTY environments.
 *
 * @example
 *   ;```ts
 *   cursorTo(0) // Move to start of line
 *   cursorTo(10, 5) // Move to column 10, row 5
 *   ```
 *
 * @param x - Column position (0-based)
 * @param y - Row position (0-based, optional)
 */
export function cursorTo(x: number, y?: number | undefined): void {
  cursorToOn(stderr, x, y)
}

/**
 * Get the number of columns (width) in the terminal.
 *
 * @example
 *   ```ts
 *   const width = getColumns()
 *   console.error(`Terminal is ${width} characters wide`)
 *   ```
 *
 * @default 80
 *
 * @returns Terminal width in characters
 */
export function getColumns(): number {
  return getColumnsOf(stderr)
}

/**
 * Get the number of rows (height) in the terminal.
 *
 * @example
 *   ```ts
 *   const height = getRows()
 *   console.error(`Terminal is ${height} lines tall`)
 *   ```
 *
 * @default 24
 *
 * @returns Terminal height in lines
 */
export function getRows(): number {
  return getRowsOf(stderr)
}

/**
 * Check if stderr is connected to a TTY (terminal).
 *
 * @example
 *   ;```ts
 *   if (isTTY()) {
 *     // Show colored error messages
 *   } else {
 *     // Use plain text
 *   }
 *   ```
 *
 * @returns `true` if stderr is a TTY, `false` if piped/redirected
 */
export function isTTY(): boolean {
  return isTTYOf(stderr)
}

/**
 * Write text to stderr without adding a newline.
 *
 * @example
 *   ;```ts
 *   writeError('Downloading...')
 *   // Later update progress
 *   ```
 *
 * @param text - Text to write.
 */
export function writeError(text: string): void {
  stderr.write(text)
}

/**
 * Write a formatted error message to stderr.
 *
 * @example
 *   ;```ts
 *   writeErrorFormatted('File not found')
 *   // Output: 'Error: File not found'
 *
 *   writeErrorFormatted('Connection failed', 'Network')
 *   // Output: 'Network: Connection failed'
 *   ```
 *
 * @default prefix 'Error'
 *
 * @param message - Error message text.
 * @param prefix - Prefix label for the error.
 */
export function writeErrorFormatted(
  message: string,
  prefix: string = 'Error',
): void {
  const formatted = `${prefix}: ${message}`
  writeErrorLine(formatted)
}

/**
 * Write a line to stderr with trailing newline. Used for error messages,
 * warnings, and diagnostic output. Passing no argument writes an empty line.
 *
 * @example
 *   ;```ts
 *   writeErrorLine('Error: File not found')
 *   writeErrorLine() // Write empty line
 *   ```
 *
 * @default text ''
 *
 * @param text - Text to write (defaults to the empty string)
 */
export function writeErrorLine(text: string = ''): void {
  stderr.write(`${text}\n`)
}

/**
 * Write an error's stack trace to stderr. Falls back to formatted error message
 * if no stack is available.
 *
 * @example
 *   ;```ts
 *   try {
 *     throw new ErrorCtor('Something went wrong')
 *   } catch (e) {
 *     writeStackTrace(e as Error)
 *   }
 *   ```
 *
 * @param error - Error object to write.
 */
export function writeStackTrace(error: Error): void {
  if (error.stack) {
    writeErrorLine(error.stack)
  } else {
    writeErrorFormatted(error.message)
  }
}

/**
 * Write a formatted warning message to stderr.
 *
 * @example
 *   ;```ts
 *   writeWarning('Deprecated API usage')
 *   // Output: 'Warning: Deprecated API usage'
 *
 *   writeWarning('Invalid config', 'Config')
 *   // Output: 'Config: Invalid config'
 *   ```
 *
 * @default prefix 'Warning'
 *
 * @param message - Warning message text.
 * @param prefix - Prefix label for the warning.
 */
export function writeWarning(
  message: string,
  prefix: string = 'Warning',
): void {
  const formatted = `${prefix}: ${message}`
  writeErrorLine(formatted)
}

// Export the raw stream for advanced usage
export { stderr }
