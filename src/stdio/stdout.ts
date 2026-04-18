/**
 * @fileoverview Standard output stream utilities.
 * Provides utilities for writing to stdout with formatting and control.
 */

import process from 'node:process'
import { WriteStream } from 'node:tty'

// Get the actual stdout stream
const stdout: NodeJS.WriteStream = process.stdout

/**
 * Clear the current line on stdout.
 * Only works in TTY environments.
 *
 * @example
 * ```ts
 * write('Processing...')
 * clearLine()
 * write('Done!')
 * ```
 */
export function clearLine(): void {
  if (stdout.isTTY) {
    stdout.cursorTo(0)
    stdout.clearLine(0)
  }
}

/**
 * Clear screen from cursor position down to bottom.
 * Only works in TTY environments.
 *
 * @example
 * ```ts
 * cursorTo(0, 5)
 * clearScreenDown() // Clear from row 5 to bottom
 * ```
 */
export function clearScreenDown(): void {
  if (stdout.isTTY) {
    stdout.clearScreenDown()
  }
}

/**
 * Move cursor to specific position on stdout.
 * Only works in TTY environments.
 *
 * @param x - Column position (0-based)
 * @param y - Row position (0-based, optional)
 *
 * @example
 * ```ts
 * cursorTo(0) // Move to start of line
 * cursorTo(10, 5) // Move to column 10, row 5
 * ```
 */
export function cursorTo(x: number, y?: number | undefined): void {
  if (stdout.isTTY) {
    stdout.cursorTo(x, y)
  }
}

/**
 * Register handlers to ensure cursor is shown on process exit.
 * Prevents hidden cursor after abnormal termination.
 * Handles SIGINT (Ctrl+C) and SIGTERM signals.
 *
 * @example
 * ```ts
 * ensureCursorOnExit()
 * hideCursor()
 * // Even if process crashes, cursor will be restored
 * ```
 */
let _cursorExitRegistered = false
export function ensureCursorOnExit(): void {
  if (_cursorExitRegistered) {
    return
  }
  _cursorExitRegistered = true
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
 * @returns Terminal width in characters
 * @default 80
 *
 * @example
 * ```ts
 * const width = getColumns()
 * console.log(`Terminal is ${width} characters wide`)
 * ```
 */
export function getColumns(): number {
  return stdout.columns || 80
}

/**
 * Get the number of rows (height) in the terminal.
 *
 * @returns Terminal height in lines
 * @default 24
 *
 * @example
 * ```ts
 * const height = getRows()
 * console.log(`Terminal is ${height} lines tall`)
 * ```
 */
export function getRows(): number {
  return stdout.rows || 24
}

/**
 * Hide the cursor on stdout.
 * Useful for cleaner output during animations.
 *
 * @example
 * ```ts
 * hideCursor()
 * // Show animation
 * showCursor()
 * ```
 */
export function hideCursor(): void {
  if (stdout.isTTY && stdout instanceof WriteStream) {
    stdout.write('\u001B[?25l')
  }
}

/**
 * Check if stdout is connected to a TTY (terminal).
 *
 * @returns `true` if stdout is a TTY, `false` if piped/redirected
 *
 * @example
 * ```ts
 * if (isTTY()) {
 *   // Show interactive UI
 * } else {
 *   // Use simple text output
 * }
 * ```
 */
export function isTTY(): boolean {
  return stdout.isTTY || false
}

/**
 * Show the cursor on stdout.
 * Should be called after `hideCursor()`.
 *
 * @example
 * ```ts
 * hideCursor()
 * // Show animation
 * showCursor()
 * ```
 */
export function showCursor(): void {
  if (stdout.isTTY && stdout instanceof WriteStream) {
    stdout.write('\u001B[?25h')
  }
}

/**
 * Write text to stdout without adding a newline.
 *
 * @param text - Text to write
 *
 * @example
 * ```ts
 * write('Loading...')
 * // Later: clear and update
 * ```
 */
export function write(text: string): void {
  stdout.write(text)
}

/**
 * Write a line to stdout with trailing newline.
 *
 * @param text - Text to write
 * @default text ''
 *
 * @example
 * ```ts
 * writeLine('Hello, world!')
 * writeLine() // Write empty line
 * ```
 */
export function writeLine(text: string = ''): void {
  stdout.write(`${text}\n`)
}

// Export the raw stream for advanced usage
export { stdout }
