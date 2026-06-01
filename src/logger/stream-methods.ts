/**
 * @file Free-function bodies for the `Logger` methods that write to or clear a
 *   raw stream rather than going through the indented `#apply` path
 *   (`clearLine`, `clearVisible`, `progress`, `write`). Each takes the calling
 *   logger plus the already-resolved `node:console` instance and whatever
 *   stream / symbol state it needs, then updates the shared blank-line /
 *   call-count tracking via the exported logger symbols. Pulling these out of
 *   `./node` keeps the `Logger` class body under the file-size cap; the class
 *   retains one-line delegators that resolve the arguments from its private
 *   state.
 */

import { ErrorCtor } from '../primordials/error'

import { lastWasBlankSymbol } from './symbols'
import { clearTerminalLine, resolveWriteStream } from './stream'

import type { ConsoleLike, LoggerTrackable } from './console-methods'
import type { LogSymbols } from './types'

/**
 * Clears the current terminal line on the logger's target stream (TTY and
 * non-TTY). Useful after `progress()`. Returns the logger for chaining.
 *
 * @param logger - The calling logger instance.
 * @param con - The logger's resolved console instance.
 * @param stream - The target stream to clear.
 */
export function clearLineMethod<T extends LoggerTrackable>(
  logger: T,
  con: ConsoleLike,
  stream: 'stderr' | 'stdout',
): T {
  clearTerminalLine(resolveWriteStream(con, stream))
  return logger
}

/**
 * Clears the visible terminal screen. Only valid on the main (non-stream-bound)
 * logger. When the underlying stdout is a TTY, resets blank-line tracking and
 * invokes `resetCount` to zero the log-call counter. Returns the logger for
 * chaining.
 *
 * @param logger - The calling logger instance.
 * @param con - The logger's resolved console instance.
 * @param boundStream - The logger's bound stream, or `undefined` on the root.
 * @param resetCount - Callback that zeroes the logger's log-call counter.
 *
 * @throws {Error} If called on a stream-bound logger instance.
 */
export function clearVisibleMethod<T extends LoggerTrackable>(
  logger: T,
  con: ConsoleLike,
  boundStream: 'stderr' | 'stdout' | undefined,
  resetCount: () => void,
): T {
  /* c8 ignore start - clearVisible TTY-mode behavior; tests use non-TTY
     capture streams so the bound-stream throw and TTY clear branches
     aren't reached. */
  if (boundStream) {
    throw new ErrorCtor(
      'clearVisible() is only available on the main logger instance, not on stream-bound instances',
    )
  }
  con.clear()
  if ((con['_stdout'] as { isTTY?: boolean | undefined }).isTTY) {
    logger[lastWasBlankSymbol](true)
    resetCount()
  }
  return logger
  /* c8 ignore stop */
}

/**
 * Shows a progress indicator (a `∴`-prefixed status message) that can be
 * cleared with `clearLine()`. Always clears the current line first so repeated
 * `progress(...)` calls redraw cleanly. Returns the logger for chaining.
 *
 * @param logger - The calling logger instance.
 * @param con - The logger's resolved console instance.
 * @param stream - The target stream to write to.
 * @param symbols - The logger's resolved `LogSymbols` map.
 * @param text - The progress message to display.
 */
export function progressMethod<T extends LoggerTrackable>(
  logger: T,
  con: ConsoleLike,
  stream: 'stderr' | 'stdout',
  symbols: LogSymbols,
  text: string,
): T {
  const streamObj = resolveWriteStream(con, stream)
  clearTerminalLine(streamObj)
  streamObj.write(`${symbols.progress} ${text}`)
  logger[lastWasBlankSymbol](false)
  return logger
}

/**
 * Writes text directly to the original stdout stream, bypassing Console
 * formatting and applying no indentation. Returns the logger for chaining.
 *
 * The original stdout is resolved with a three-way fallback: the seeded
 * `originalStdout`, then the constructor args' `stdout`, then the Console's
 * internal `_stdout` slot.
 *
 * @param logger - The calling logger instance.
 * @param con - The logger's resolved console instance.
 * @param originalStdout - The stdout seeded at construction, if any.
 * @param ctorArgs - The logger's stored constructor args.
 * @param text - The text to write.
 */
export function writeMethod<T extends LoggerTrackable>(
  logger: T,
  con: ConsoleLike,
  originalStdout: NodeJS.WritableStream | undefined,
  ctorArgs: unknown[],
  text: string,
): T {
  /* c8 ignore start - the two fallback arms (ctorArgs.stdout, then
     con._stdout) only fire when originalStdout wasn't seeded, which most
     Logger instances avoid by passing options. */
  const stdout =
    originalStdout ||
    (ctorArgs[0] as { stdout?: NodeJS.WritableStream | undefined } | undefined)
      ?.stdout ||
    (con as unknown as { _stdout: NodeJS.WritableStream })._stdout
  /* c8 ignore stop */
  stdout.write(text)
  logger[lastWasBlankSymbol](false)
  return logger
}
