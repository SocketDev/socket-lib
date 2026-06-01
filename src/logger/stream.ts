/**
 * @file Terminal stream resolution + line-clearing helpers shared by the
 *   Node-side `Logger` methods that write directly to a stream (`clearLine`,
 *   `clearVisible`, `progress`). The Logger's `node:console` instance keeps its
 *   underlying writable streams on the internal `_stderr` / `_stdout` symbols;
 *   these helpers resolve the right one for a given target stream and centralize
 *   the TTY-vs-non-TTY clear sequence (`cursorTo(0) + clearLine(0)` on a TTY,
 *   `\r\x1b[K` fallback elsewhere — which still works in CI logs).
 */

/**
 * Subset of `NodeJS.WriteStream` the logger needs for direct, cursor-aware
 * writes. Modeled as a structural shape so the cast off the console's internal
 * `_stderr` / `_stdout` slots stays explicit.
 */
export interface WriteStreamLike {
  isTTY: boolean
  cursorTo: (x: number) => void
  clearLine: (dir: number) => void
  write: (text: string) => boolean
}

/**
 * Resolve the underlying writable stream for a target stream from a console
 * instance, casting from the console's internal `_stderr` / `_stdout` slots to
 * the cursor-aware shape the logger writes to directly.
 *
 * @param con - The console instance exposing `_stderr` / `_stdout`.
 * @param stream - Which target stream to resolve.
 */
export function resolveWriteStream(
  con: Record<string, unknown>,
  stream: 'stderr' | 'stdout',
): WriteStreamLike {
  return (
    stream === 'stderr' ? con['_stderr'] : con['_stdout']
  ) as WriteStreamLike
}

/**
 * Clear the current line on a writable stream. Uses `cursorTo(0) +
 * clearLine(0)` on a TTY and falls back to `\r\x1b[K` otherwise so the same
 * call redraws cleanly in both interactive terminals and CI logs.
 *
 * @param streamObj - The resolved writable stream to clear.
 */
export function clearTerminalLine(streamObj: WriteStreamLike): void {
  if (streamObj.isTTY) {
    streamObj.cursorTo(0)
    streamObj.clearLine(0)
  } else {
    streamObj.write('\r\x1b[K')
  }
}
