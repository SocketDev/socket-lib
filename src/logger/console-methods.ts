/**
 * @file Free-function bodies for the `Logger` methods that are thin, chainable
 *   mirrors of the underlying `node:console` API (`assert`, `count`, `dir`,
 *   `dirxml`, `table`, `time`, `timeEnd`, `timeLog`, `trace`). Each takes the
 *   calling logger plus its already-resolved `node:console` instance, delegates
 *   to the matching console method, updates the shared blank-line / call-count
 *   tracking via the exported logger symbols, and returns the logger for
 *   chaining. Pulling these out of `./node` keeps the `Logger` class body under
 *   the file-size cap while preserving the per-method documentation here. The
 *   class retains one-line delegators that supply `this` and
 *   `this.#getConsole()`.
 */

import { incLogCallCountSymbol, lastWasBlankSymbol } from './symbols'

import type { InspectOptions } from 'node:util'

/**
 * The slice of `node:console` the mirror methods call into, plus the internal
 * `_stderr` / `_stdout` slots reached elsewhere. Modeled structurally so the
 * cast from the lazily-built per-instance Console stays explicit.
 */
export type ConsoleLike = typeof console & Record<string, unknown>

/**
 * The slice of `Logger` the mirror methods need: the two symbol-keyed tracking
 * methods. Typed structurally to avoid a circular import with `./node`.
 */
export interface LoggerTrackable {
  [incLogCallCountSymbol](): LoggerTrackable
  [lastWasBlankSymbol](value: unknown, stream?: 'stderr' | 'stdout'): unknown
}

/**
 * Logs an assertion failure message if the value is falsy.
 *
 * Works like `console.assert()` but returns the logger for chaining. If the
 * value is truthy, nothing is logged. If falsy, logs an error message with an
 * assertion failure.
 *
 * @param logger - The calling logger instance.
 * @param con - The logger's resolved console instance.
 * @param value - The value to test.
 * @param message - Optional message and additional arguments to log.
 */
export function assertMethod<T extends LoggerTrackable>(
  logger: T,
  con: ConsoleLike,
  value: unknown,
  message: unknown[],
): T {
  con.assert(Boolean(value), message[0] as string, ...message.slice(1))
  logger[lastWasBlankSymbol](false)
  return value ? logger : (logger[incLogCallCountSymbol]() as T)
}

/**
 * Increments and logs a counter for the given label.
 *
 * Each unique label maintains its own counter. Works like `console.count()`.
 *
 * @param logger - The calling logger instance.
 * @param con - The logger's resolved console instance.
 * @param label - Optional label for the counter (defaults to 'default').
 */
export function countMethod<T extends LoggerTrackable>(
  logger: T,
  con: ConsoleLike,
  label?: string | undefined,
): T {
  con.count(label)
  logger[lastWasBlankSymbol](false)
  return logger[incLogCallCountSymbol]() as T
}

/**
 * Displays an object's properties in a formatted way.
 *
 * Works like `console.dir()` with customizable options for depth, colors, etc.
 * Useful for inspecting complex objects.
 *
 * @param logger - The calling logger instance.
 * @param con - The logger's resolved console instance.
 * @param obj - The object to display.
 * @param options - Optional formatting options (Node.js inspect options).
 */
export function dirMethod<T extends LoggerTrackable>(
  logger: T,
  con: ConsoleLike,
  obj: unknown,
  options?: unknown | undefined,
): T {
  con.dir(obj, options as InspectOptions | undefined)
  logger[lastWasBlankSymbol](false)
  return logger[incLogCallCountSymbol]() as T
}

/**
 * Displays data as XML/HTML in a formatted way.
 *
 * Works like `console.dirxml()`. In Node.js, behaves the same as `dir()`.
 *
 * @param logger - The calling logger instance.
 * @param con - The logger's resolved console instance.
 * @param data - The data to display.
 */
export function dirxmlMethod<T extends LoggerTrackable>(
  logger: T,
  con: ConsoleLike,
  data: unknown[],
): T {
  con.dirxml(data)
  logger[lastWasBlankSymbol](false)
  return logger[incLogCallCountSymbol]() as T
}

/**
 * Displays data in a table format.
 *
 * Works like `console.table()`. Accepts arrays of objects or objects with
 * nested objects. Optionally specify which properties to include in the table.
 *
 * @param logger - The calling logger instance.
 * @param con - The logger's resolved console instance.
 * @param tabularData - The data to display as a table.
 * @param properties - Optional array of property names to include.
 */
export function tableMethod<T extends LoggerTrackable>(
  logger: T,
  con: ConsoleLike,
  tabularData: unknown,
  properties?: readonly string[] | undefined,
): T {
  con.table(tabularData, properties ? [...properties] : undefined)
  logger[lastWasBlankSymbol](false)
  return logger[incLogCallCountSymbol]() as T
}

/**
 * Ends a timer and logs the elapsed time.
 *
 * Logs the duration since `console.time()` or `logger.time()` was called with
 * the same label. The timer is stopped and removed.
 *
 * @param logger - The calling logger instance.
 * @param con - The logger's resolved console instance.
 * @param label - Optional label for the timer (defaults to 'default').
 */
export function timeEndMethod<T extends LoggerTrackable>(
  logger: T,
  con: ConsoleLike,
  label?: string | undefined,
): T {
  con.timeEnd(label)
  logger[lastWasBlankSymbol](false)
  return logger[incLogCallCountSymbol]() as T
}

/**
 * Logs the current value of a timer without stopping it.
 *
 * Logs the duration since `console.time()` was called with the same label, but
 * keeps the timer running. Can include additional data to log alongside the
 * time.
 *
 * @param logger - The calling logger instance.
 * @param con - The logger's resolved console instance.
 * @param label - Optional label for the timer (defaults to 'default').
 * @param data - Additional data to log with the time.
 */
export function timeLogMethod<T extends LoggerTrackable>(
  logger: T,
  con: ConsoleLike,
  label: string | undefined,
  data: unknown[],
): T {
  con.timeLog(label, ...data)
  logger[lastWasBlankSymbol](false)
  return logger[incLogCallCountSymbol]() as T
}

/**
 * Starts a timer for measuring elapsed time.
 *
 * Creates a timer with the given label. Use `timeEnd()` with the same label to
 * stop the timer and log the elapsed time, or use `timeLog()` to check the time
 * without stopping the timer.
 *
 * @param logger - The calling logger instance.
 * @param con - The logger's resolved console instance.
 * @param label - Optional label for the timer (defaults to 'default').
 */
export function timeMethod<T extends LoggerTrackable>(
  logger: T,
  con: ConsoleLike,
  label?: string | undefined,
): T {
  con.time(label)
  return logger
}

/**
 * Logs a stack trace to the console.
 *
 * Works like `console.trace()`. Shows the call stack leading to where this
 * method was called. Useful for debugging.
 *
 * @param logger - The calling logger instance.
 * @param con - The logger's resolved console instance.
 * @param message - Optional message to display with the trace.
 * @param args - Additional arguments to log.
 */
export function traceMethod<T extends LoggerTrackable>(
  logger: T,
  con: ConsoleLike,
  message: unknown | undefined,
  args: unknown[],
): T {
  con.trace(message, ...args)
  logger[lastWasBlankSymbol](false)
  return logger[incLogCallCountSymbol]() as T
}
