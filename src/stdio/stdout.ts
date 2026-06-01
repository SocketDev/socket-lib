/**
 * @file Standard output stream utilities. Provides utilities for writing to
 *   stdout with formatting and control.
 */

import process from 'node:process'
import { WriteStream } from 'node:tty'

import {
  clearLineOn,
  cursorToOn,
  getColumnsOf,
  getRowsOf,
  isTTYOf,
} from './_internal'

// Get the actual stdout stream
const stdout: NodeJS.WriteStream = process.stdout

// Module-level flag for ensureCursorOnExit idempotency.
let cursorExitRegistered = false

/**
 * Clear the current line on stdout. Only works in TTY environments.
 *
 * @example
 *   ;```ts
 *   write('Processing...')
 *   clearLine()
 *   write('Done!')
 *   ```
 */
export function clearLine(): void {
  clearLineOn(stdout)
}

/**
 * Clear screen from cursor position down to bottom. Only works in TTY
 * environments.
 *
 * @example
 *   ;```ts
 *   cursorTo(0, 5)
 *   clearScreenDown() // Clear from row 5 to bottom
 *   ```
 */
export function clearScreenDown(): void {
  if (stdout.isTTY) {
    stdout.clearScreenDown()
  }
}

/**
 * Move cursor to specific position on stdout. Only works in TTY environments.
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
  cursorToOn(stdout, x, y)
}

/**
 * Register handlers to ensure cursor is shown on process exit. Prevents hidden
 * cursor after abnormal termination. Handles SIGINT (Ctrl+C) and SIGTERM
 * signals.
 *
 * @example
 *   ;```ts
 *   ensureCursorOnExit()
 *   hideCursor()
 *   // Even if process crashes, cursor will be restored
 *   ```
 */
export function ensureCursorOnExit(): void {
  if (cursorExitRegistered) {
    return
  }
  cursorExitRegistered = true
  process.on('exit', showCursor)
  process.on('SIGINT', () => {
    showCursor()
    // eslint-disable-next-line n/no-process-exit
    process.exit(130)
  })
  process.on('SIGTERM', () => {
    showCursor()
    // eslint-disable-next-line n/no-process-exit
    process.exit(143)
  })
}

/**
 * Get the number of columns (width) in the terminal.
 *
 * @example
 *   ```ts
 *   const width = getColumns()
 *   console.log(`Terminal is ${width} characters wide`)
 *   ```
 *
 * @default 80
 *
 * @returns Terminal width in characters
 */
export function getColumns(): number {
  return getColumnsOf(stdout)
}

/**
 * Get the number of rows (height) in the terminal.
 *
 * @example
 *   ```ts
 *   const height = getRows()
 *   console.log(`Terminal is ${height} lines tall`)
 *   ```
 *
 * @default 24
 *
 * @returns Terminal height in lines
 */
export function getRows(): number {
  return getRowsOf(stdout)
}

/**
 * Hide the cursor on stdout. Useful for cleaner output during animations.
 *
 * @example
 *   ;```ts
 *   hideCursor()
 *   // Show animation
 *   showCursor()
 *   ```
 */
export function hideCursor(): void {
  if (stdout.isTTY && stdout instanceof WriteStream) {
    stdout.write('\u001B[?25l')
  }
}

/**
 * Check if stdout is connected to a TTY (terminal).
 *
 * @example
 *   ;```ts
 *   if (isTTY()) {
 *     // Show interactive UI
 *   } else {
 *     // Use simple text output
 *   }
 *   ```
 *
 * @returns `true` if stdout is a TTY, `false` if piped/redirected
 */
export function isTTY(): boolean {
  return isTTYOf(stdout)
}

/**
 * Show the cursor on stdout. Should be called after `hideCursor()`.
 *
 * @example
 *   ;```ts
 *   hideCursor()
 *   // Show animation
 *   showCursor()
 *   ```
 */
export function showCursor(): void {
  if (stdout.isTTY && stdout instanceof WriteStream) {
    stdout.write('\u001B[?25h')
  }
}

/**
 * Write text to stdout without adding a newline.
 *
 * @example
 *   ;```ts
 *   write('Loading...')
 *   // Later: clear and update
 *   ```
 *
 * @param text - Text to write.
 */
export function write(text: string): void {
  stdout.write(text)
}

/**
 * Write a line to stdout with trailing newline.
 *
 * @example
 *   ;```ts
 *   writeLine('Hello, world!')
 *   writeLine() // Write empty line
 *   ```
 *
 * @default text ''
 *
 * @param text - Text to write.
 */
export function writeLine(text: string = ''): void {
  stdout.write(`${text}\n`)
}

// Export the raw stream for advanced usage
export { stdout }
