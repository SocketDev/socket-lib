/**
 * @fileoverview Shared TTY primitives for stdio/stdout.ts + stdio/stderr.ts.
 * @private
 */

/**
 * Clear the current line on the given stream.
 * Only works in TTY environments.
 * @private
 */
export function clearLineOn(stream: NodeJS.WriteStream): void {
  if (stream.isTTY) {
    stream.cursorTo(0)
    stream.clearLine(0)
  }
}

/**
 * Move cursor to specific position on the given stream.
 * Only works in TTY environments.
 * @private
 */
export function cursorToOn(
  stream: NodeJS.WriteStream,
  x: number,
  y?: number | undefined,
): void {
  if (stream.isTTY) {
    stream.cursorTo(x, y)
  }
}

/**
 * Get the number of columns on the given stream (or 80 fallback).
 * @private
 */
export function getColumnsOf(stream: NodeJS.WriteStream): number {
  return stream.columns || 80
}

/**
 * Get the number of rows on the given stream (or 24 fallback).
 * @private
 */
export function getRowsOf(stream: NodeJS.WriteStream): number {
  return stream.rows || 24
}

/**
 * Check if the given stream is connected to a TTY.
 * @private
 */
export function isTTYOf(stream: NodeJS.WriteStream): boolean {
  return stream.isTTY || false
}
