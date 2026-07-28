/**
 * @file Terminal clearing and cursor utilities. Provides functions for clearing
 *   lines, screens, and managing cursor position.
 */

import process from 'node:process'

/**
 * Clear the current line in the terminal. Uses native TTY methods when
 * available, falls back to ANSI escape codes. Uses native TTY methods when
 * available and falls back to `\r\x1b[K` ANSI escapes on non-TTY streams.
 *
 * ANSI Sequences:
 *
 * - `\r`: Carriage return (move to line start)
 * - `\x1b[K`: Clear from cursor to end of line
 *
 * @example
 *   ;```ts
 *   clearLine() // Clear current line on stdout
 *   clearLine(process.stderr) // Clear on stderr
 *   ```
 *
 * @default stream process.stdout
 *
 * @param stream - Output stream to clear (defaults to `process.stdout`)
 */
export function clearLine(stream: NodeJS.WriteStream = process.stdout): void {
  if (stream.isTTY) {
    // TTY: Use cursor control
    stream.cursorTo(0)
    stream.clearLine(0)
  } else {
    // Non-TTY: Use ANSI escape codes
    stream.write('\r\x1b[K')
  }
}

/**
 * Clear multiple lines above the current cursor position. Useful for clearing
 * multi-line output like progress bars or status messages.
 *
 * ANSI Sequences:
 *
 * - `\x1b[1A`: Move cursor up one line
 * - `\x1b[2K`: Erase entire line
 *
 * @example
 *   ;```ts
 *   console.log('Line 1')
 *   console.log('Line 2')
 *   console.log('Line 3')
 *   clearLines(2) // Clears lines 2 and 3
 *   ```
 *
 * @default stream process.stdout
 *
 * @param count - Number of lines to clear.
 * @param stream - Output stream to clear.
 */
export function clearLines(
  count: number,
  stream: NodeJS.WriteStream = process.stdout,
): void {
  for (let i = 0; i < count; i++) {
    // Move up and clear line
    stream.write('\x1b[1A\x1b[2K')
  }
}

/**
 * Clear the entire screen and reset cursor to top-left. Only works in TTY
 * environments.
 *
 * ANSI Sequence:
 *
 * - `\x1bc`: Full reset (clear screen and move cursor home)
 *
 * @example
 *   ;```ts
 *   clearScreen() // Clear entire terminal
 *   ```
 *
 * @default stream process.stdout
 *
 * @param stream - Output stream to clear.
 */
export function clearScreen(stream: NodeJS.WriteStream = process.stdout): void {
  if (stream.isTTY) {
    // Clear screen and move cursor to top-left
    stream.write('\x1bc')
  }
}

/**
 * Clear the visible terminal screen. Alias for `clearScreen()`.
 *
 * @example
 *   ;```ts
 *   clearVisible() // Same as clearScreen()
 *   ```
 *
 * @default stream process.stdout
 *
 * @param stream - Output stream to clear.
 */
export function clearVisible(
  stream: NodeJS.WriteStream = process.stdout,
): void {
  clearScreen(stream)
}

/**
 * Move cursor to the beginning of the current line. Uses native TTY methods
 * when available, falls back to carriage return.
 *
 * @example
 *   ;```ts
 *   process.stdout.write('Some text...')
 *   cursorToStart()
 *   process.stdout.write('New text') // Overwrites from start
 *   ```
 *
 * @default stream process.stdout
 *
 * @param stream - Output stream to manipulate.
 */
export function cursorToStart(
  stream: NodeJS.WriteStream = process.stdout,
): void {
  if (stream.isTTY) {
    stream.cursorTo(0)
  } else {
    stream.write('\r')
  }
}

/**
 * Hide the terminal cursor. Useful for cleaner output during animations or
 * progress indicators.
 *
 * ANSI Sequence:
 *
 * - `\x1b[?25l`: DECTCEM hide cursor
 *
 * @example
 *   ;```ts
 *   hideCursor()
 *   // ... show animation
 *   showCursor()
 *   ```
 *
 * @default stream process.stdout
 *
 * @param stream - Output stream to manipulate.
 */
export function hideCursor(stream: NodeJS.WriteStream = process.stdout): void {
  stream.write('\x1b[?25l')
}

/**
 * Restore cursor to previously saved position. Must be called after
 * `saveCursor()`.
 *
 * ANSI Sequence:
 *
 * - `\x1b8`: DECRC restore cursor
 *
 * @example
 *   ;```ts
 *   saveCursor()
 *   console.log('Temporary text')
 *   restoreCursor()
 *   console.log('Back at saved position')
 *   ```
 *
 * @default stream process.stdout
 *
 * @param stream - Output stream to manipulate.
 */
export function restoreCursor(
  stream: NodeJS.WriteStream = process.stdout,
): void {
  stream.write('\x1b8')
}

/**
 * Save the current cursor position. Can be restored later with
 * `restoreCursor()`.
 *
 * ANSI Sequence:
 *
 * - `\x1b7`: DECSC save cursor
 *
 * @example
 *   ;```ts
 *   saveCursor()
 *   console.log('Temporary text')
 *   restoreCursor()
 *   console.log('Back at saved position')
 *   ```
 *
 * @default stream process.stdout
 *
 * @param stream - Output stream to manipulate.
 */
export function saveCursor(stream: NodeJS.WriteStream = process.stdout): void {
  stream.write('\x1b7')
}

/**
 * Show the terminal cursor. Should be called after `hideCursor()` to restore
 * normal cursor visibility.
 *
 * ANSI Sequence:
 *
 * - `\x1b[?25h`: DECTCEM show cursor
 *
 * @example
 *   ;```ts
 *   hideCursor()
 *   // ... show animation
 *   showCursor()
 *   ```
 *
 * @default stream process.stdout
 *
 * @param stream - Output stream to manipulate.
 */
export function showCursor(stream: NodeJS.WriteStream = process.stdout): void {
  stream.write('\x1b[?25h')
}
