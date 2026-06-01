/**
 * @file Free-function bodies for the symbol-prefixed semantic `Logger` methods
 *   (`done`, `fail`, `info`, `skip`, `step`, `success`, `warn`). Each strips
 *   any leading status symbol from the message, re-prefixes it with the theme's
 *   colored symbol, writes to the appropriate stream (status messages to
 *   stderr, `step` to stdout), and updates the shared blank-line / call-count
 *   tracking via the exported logger symbols. Pulling these out of `./node`
 *   keeps the `Logger` class body under the file-size cap. The class retains
 *   one-line delegators that resolve `con` / `indent` / `symbols` from its
 *   private state and forward them here.
 */

import { ArrayPrototypeAt, ArrayPrototypeSlice } from '../primordials/array'
import { ReflectApply } from '../primordials/reflect'

import { applyLinePrefix } from '../strings/format'
import { isBlankString } from '../strings/predicates'
import { stripLoggerSymbols } from './symbols-builder'
import { incLogCallCountSymbol, lastWasBlankSymbol } from './symbols'

import type { ConsoleLike, LoggerTrackable } from './console-methods'
import type { LogSymbols } from './types'

/**
 * Apply a `node:console` method with the given indentation prefix on its first
 * (string) argument.
 *
 * Mirrors the former private `#apply`: when the first argument is a string it
 * is line-prefixed with `indent`; otherwise the args pass through unchanged.
 * Tracks the blank-line state for `targetStream` and bumps the call count.
 * Returns the logger for chaining.
 *
 * @param logger - The calling logger instance.
 * @param con - The logger's resolved console instance.
 * @param methodName - The `node:console` method to invoke (`log`, `error`,
 *   ...).
 * @param args - The arguments forwarded to the console method.
 * @param targetStream - The stream the method writes to.
 * @param indent - The resolved indentation prefix for `targetStream`.
 */
export function applyMethod<T extends LoggerTrackable>(
  logger: T,
  con: ConsoleLike,
  methodName: string,
  args: unknown[],
  targetStream: 'stderr' | 'stdout',
  indent: string,
): T {
  const text = ArrayPrototypeAt(args, 0)
  const hasText = typeof text === 'string'
  const logArgs = hasText
    ? [
        applyLinePrefix(text, { prefix: indent }),
        ...ArrayPrototypeSlice(args, 1),
      ]
    : args
  ReflectApply(con[methodName] as (...a: unknown[]) => unknown, con, logArgs)
  logger[lastWasBlankSymbol](hasText && isBlankString(logArgs[0]), targetStream)
  logger[incLogCallCountSymbol]()
  return logger
}

/**
 * Logs a main step message with a colored arrow symbol to stdout.
 *
 * Strips any leading status symbol from `msg`, re-prefixes it with the theme's
 * `step` symbol, and writes to stdout (unlike the other semantic methods, which
 * go to stderr). The blank line before the step is handled by the caller.
 * Returns the logger for chaining.
 *
 * @param logger - The calling logger instance.
 * @param con - The logger's resolved console instance.
 * @param indent - The resolved stdout indentation prefix.
 * @param symbols - The logger's resolved `LogSymbols` map.
 * @param msg - The step message to log.
 * @param extras - Additional arguments to log.
 */
export function stepMethod<T extends LoggerTrackable>(
  logger: T,
  con: ConsoleLike,
  indent: string,
  symbols: LogSymbols,
  msg: string,
  extras: unknown[],
): T {
  const text = stripLoggerSymbols(msg)
  con.log(
    applyLinePrefix(`${symbols.step} ${text}`, {
      prefix: indent,
    }),
    ...extras,
  )
  logger[lastWasBlankSymbol](false, 'stdout')
  logger[incLogCallCountSymbol]()
  return logger
}

/**
 * Strip a leading status symbol, re-prefix with the colored symbol for
 * `symbolType`, and write to stderr.
 *
 * Mirrors the former private `#symbolApply`: status messages (info / fail /
 * success / warn / skip / done) always go to stderr. Returns the logger for
 * chaining.
 *
 * @param logger - The calling logger instance.
 * @param con - The logger's resolved console instance.
 * @param indent - The resolved stderr indentation prefix.
 * @param symbols - The logger's resolved `LogSymbols` map.
 * @param symbolType - The `LogSymbols` key whose symbol prefixes the message.
 * @param args - The message and additional arguments to log.
 */
export function symbolApplyMethod<T extends LoggerTrackable>(
  logger: T,
  con: ConsoleLike,
  indent: string,
  symbols: LogSymbols,
  symbolType: string,
  args: unknown[],
): T {
  let text = args[0]
  let extras: unknown[]
  /* c8 ignore start - text-non-string arm fires only when caller passes
     an object as the first argument; tests always pass a string. */
  if (typeof text === 'string') {
    text = stripLoggerSymbols(text)
    extras = args.slice(1)
  } else {
    extras = args
    text = ''
  }
  /* c8 ignore stop */
  con.error(
    applyLinePrefix(`${symbols[symbolType as keyof LogSymbols]} ${text}`, {
      prefix: indent,
    }),
    ...extras,
  )
  logger[lastWasBlankSymbol](false, 'stderr')
  logger[incLogCallCountSymbol]()
  return logger
}
