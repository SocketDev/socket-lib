/**
 * @file Node-side `Logger` class — owns per-instance state (parent, bound
 *   stream, indent buffers, theme) and exposes the public surface as thin
 *   delegators over sibling free-function leaves. Console construction is lazy:
 *   the constructor stashes its args in `_internal.privateConstructorArgs` and
 *   the `node:console` instance is built on first `#getConsole()`, so the
 *   logger can be imported during early Node.js bootstrap before stdout is
 *   ready (avoiding `ERR_CONSOLE_WRITABLE_STREAM`). Method bodies live in the
 *   leaves: `./console-methods`, `./semantic-methods`, `./indentation-methods`,
 *   `./stream-methods`, `./console`, `./options`, `./symbols`,
 *   `./symbols-builder`, `./_internal`.
 */

import { ReflectApply } from '../primordials/reflect'

import { getTheme } from '../themes/context'

import { privateConstructorArgs } from './_internal'
import { buildLoggerSymbols } from './symbols-builder'
import {
  incLogCallCountSymbol,
  lastWasBlankSymbol,
  LOG_SYMBOLS,
} from './symbols'

import { resolveConsole } from './console'
import {
  assertMethod,
  countMethod,
  dirMethod,
  dirxmlMethod,
  tableMethod,
  timeEndMethod,
  timeLogMethod,
  timeMethod,
  traceMethod,
} from './console-methods'
import {
  dedentMethod,
  groupEndMethod,
  groupMethod,
  indentMethod,
  resetIndentMethod,
} from './indentation-methods'
import { parseLoggerOptions } from './options'
import { applyMethod, stepMethod, symbolApplyMethod } from './semantic-methods'
import {
  clearLineMethod,
  clearVisibleMethod,
  progressMethod,
  writeMethod,
} from './stream-methods'

import type { IndentContext } from './indentation-methods'

import type { LogSymbols, Task } from './types'
import type { Theme } from '../themes/types'

/**
 * Enhanced console logger with indentation, colored symbols, and stream
 * management.
 */
export class Logger {
  /**
   * Static reference to log symbols for convenience.
   */
  static LOG_SYMBOLS = LOG_SYMBOLS

  #parent?: Logger | undefined
  #boundStream?: 'stderr' | 'stdout' | undefined
  #stderrLogger?: Logger | undefined
  #stdoutLogger?: Logger | undefined
  #stderrIndention = ''
  #stdoutIndention = ''
  #stderrLastWasBlank = false
  #stdoutLastWasBlank = false
  #logCallCount = 0
  #options: Record<string, unknown>
  #originalStdout?: NodeJS.WritableStream | undefined
  #theme?: Theme | undefined

  /**
   * Creates a new Logger. With no args it uses the default `process.stdout` /
   * `process.stderr`; an options object customizes stream / theme. See
   * {@link parseLoggerOptions}.
   *
   * @param args - Optional console constructor arguments.
   */
  constructor(...args: unknown[]) {
    // Store constructor args for lazy Console initialization (built on first
    // use so the logger can be imported during early Node.js bootstrap before
    // stdout is ready, avoiding ERR_CONSOLE_WRITABLE_STREAM).
    privateConstructorArgs.set(this, args)

    const parsed = parseLoggerOptions(args)
    this.#options = parsed.options
    this.#originalStdout = parsed.originalStdout
    this.#theme = parsed.theme
  }

  // Resolve target stream + indent, then delegate to applyMethod for an
  // indented console write. Backs `log` / `error`.
  #apply(
    methodName: string,
    args: unknown[],
    stream?: 'stderr' | 'stdout',
  ): this {
    const targetStream = stream || (methodName === 'log' ? 'stdout' : 'stderr')
    return applyMethod(
      this,
      this.#getConsole(),
      methodName,
      args,
      targetStream,
      this.#getIndent(targetStream),
    )
  }

  // Resolve this logger's lazily-built Console. See resolveConsole.
  #getConsole(): typeof console & Record<string, unknown> {
    return resolveConsole(this)
  }

  // Read the indentation prefix for a stream (from the root logger).
  #getIndent(stream: 'stderr' | 'stdout'): string {
    const root = this.#getRoot()
    return stream === 'stderr' ? root.#stderrIndention : root.#stdoutIndention
  }

  // Read the last-was-blank flag for a stream (from the root logger).
  #getLastWasBlank(stream: 'stderr' | 'stdout'): boolean {
    const root = this.#getRoot()
    return stream === 'stderr'
      ? root.#stderrLastWasBlank
      : root.#stdoutLastWasBlank
  }

  // The root logger that owns the shared indentation / blank-line state.
  #getRoot(): Logger {
    return this.#parent || this
  }

  // Build this logger's `LogSymbols` map from its resolved theme.
  #getSymbols(): LogSymbols {
    return buildLoggerSymbols(this.#getTheme())
  }

  // The stream this logger writes to (`stderr` unless stdout-bound).
  #getTargetStream(): 'stderr' | 'stdout' {
    return this.#boundStream || 'stderr'
  }

  // The instance theme if set, else the context theme.
  #getTheme(): Theme {
    return this.#theme ?? getTheme()
  }

  // Build the indentation accessor context handed to the indentation-domain
  // free helpers, closing over the private indent read / write helpers so they
  // never touch private fields directly.
  #indentCtx(): IndentContext {
    return {
      boundStream: this.#boundStream,
      getIndent: (stream: 'stderr' | 'stdout') => this.#getIndent(stream),
      setIndent: (stream: 'stderr' | 'stdout', value: string) =>
        this.#setIndent(stream, value),
    }
  }

  // Write the indentation prefix for a stream (on the root logger).
  #setIndent(stream: 'stderr' | 'stdout', value: string): void {
    const root = this.#getRoot()
    if (stream === 'stderr') {
      root.#stderrIndention = value
    } else {
      root.#stdoutIndention = value
    }
  }

  // Write the last-was-blank flag for a stream (on the root logger).
  // socket-lint: allow boolean-trap -- private setter; `value` is the
  // last-was-blank flag being stored for the given stream.
  #setLastWasBlank(stream: 'stderr' | 'stdout', value: boolean): void {
    const root = this.#getRoot()
    if (stream === 'stderr') {
      root.#stderrLastWasBlank = value
    } else {
      root.#stdoutLastWasBlank = value
    }
  }

  // Build a child logger bound to `stream`, inheriting constructor args,
  // options, and theme. Backs the `stderr` / `stdout` getters; indentation is
  // tracked separately per stream.
  #streamChild(stream: 'stderr' | 'stdout'): Logger {
    const ctorArgs = privateConstructorArgs.get(this) ?? []
    const instance = new Logger(...ctorArgs)
    instance.#parent = this
    instance.#boundStream = stream
    instance.#options = { __proto__: null, ...this.#options }
    if (this.#theme) {
      instance.#theme = this.#theme
    }
    return instance
  }

  // Resolve console + stderr indent + theme symbols, then delegate to
  // symbolApplyMethod so each status method (`done`, `fail`, `info`, `skip`,
  // `success`, `warn`) stays a one-line forwarder.
  #symbol(symbolType: string, args: unknown[]): this {
    return symbolApplyMethod(
      this,
      this.#getConsole(),
      this.#getIndent('stderr'),
      this.#getSymbols(),
      symbolType,
      args,
    )
  }

  // A cached logger bound exclusively to stderr (separate indentation from
  // stdout).
  get stderr(): Logger {
    if (!this.#stderrLogger) {
      this.#stderrLogger = this.#streamChild('stderr')
    }
    return this.#stderrLogger
  }

  // A cached logger bound exclusively to stdout (separate indentation from
  // stderr).
  get stdout(): Logger {
    if (!this.#stdoutLogger) {
      this.#stdoutLogger = this.#streamChild('stdout')
    }
    return this.#stdoutLogger
  }

  // The total number of log calls made on this logger instance.
  get logCallCount() {
    const root = this.#getRoot()
    return root.#logCallCount
  }

  // Increments the internal log call counter. Called automatically by logging
  // methods; not for direct use.
  [incLogCallCountSymbol]() {
    const root = this.#getRoot()
    root.#logCallCount += 1
    return this
  }

  // Sets whether the last logged line was blank. An explicit `stream` targets
  // that stream; otherwise the bound stream (or both, on the root) is updated.
  // Called automatically by logging methods.
  [lastWasBlankSymbol](value: unknown, stream?: 'stderr' | 'stdout'): this {
    if (stream) {
      this.#setLastWasBlank(stream, !!value)
    } else if (this.#boundStream) {
      this.#setLastWasBlank(this.#boundStream, !!value)
    } else {
      this.#setLastWasBlank('stderr', !!value)
      this.#setLastWasBlank('stdout', !!value)
    }
    return this
  }

  // Logs an assertion failure message if the value is falsy. See assertMethod.
  assert(value: unknown, ...message: unknown[]): this {
    return assertMethod(this, this.#getConsole(), value, message)
  }

  // Clears the current terminal line on the target stream. See clearLineMethod.
  clearLine(): this {
    return clearLineMethod(this, this.#getConsole(), this.#getTargetStream())
  }

  // Clears the visible terminal screen (main logger only). See
  // clearVisibleMethod. Throws if called on a stream-bound instance.
  clearVisible() {
    return clearVisibleMethod(
      this,
      this.#getConsole(),
      this.#boundStream,
      () => {
        this.#logCallCount = 0
      },
    )
  }

  // Increments and logs a counter for the given label. See countMethod.
  count(label?: string | undefined): this {
    return countMethod(this, this.#getConsole(), label)
  }

  /**
   * Creates a task whose `run()` logs "Starting task: {name}" before running
   * the provided function and "Completed task: {name}" after.
   *
   * @param name - The name of the task.
   *
   * @returns A task object with a `run()` method.
   */
  createTask(name: string): Task {
    return {
      run: <T>(f: () => T): T => {
        this.log(`Starting task: ${name}`)
        const result = f()
        this.log(`Completed task: ${name}`)
        return result
      },
    }
  }

  // Decreases the indentation level by `spaces` (default 2). See dedentMethod.
  dedent(spaces = 2) {
    return dedentMethod(this, this.#indentCtx(), spaces)
  }

  // Displays an object's properties in a formatted way. See dirMethod.
  dir(obj: unknown, options?: unknown | undefined): this {
    return dirMethod(this, this.#getConsole(), obj, options)
  }

  // Displays data as XML/HTML in a formatted way. See dirxmlMethod.
  dirxml(...data: unknown[]): this {
    return dirxmlMethod(this, this.#getConsole(), data)
  }

  // Logs a completion message with the success symbol (alias for `success()`);
  // does NOT clear the current line. See symbolApplyMethod.
  done(...args: unknown[]): this {
    return this.#symbol('success', args)
  }

  // Logs an error message to stderr with current indentation, like
  // `console.error()`.
  error(...args: unknown[]): this {
    return this.#apply('error', args)
  }

  // Logs a newline to stderr unless the last line was already blank.
  errorNewline() {
    return this.#getLastWasBlank('stderr') ? this : this.error('')
  }

  // Logs a failure message with the red `LOG_SYMBOLS.fail` symbol to stderr.
  // See symbolApplyMethod.
  fail(...args: unknown[]): this {
    return this.#symbol('fail', args)
  }

  // Starts a new indented log group, logging an optional `label` first. See
  // groupMethod.
  group(...label: unknown[]): this {
    return groupMethod(this, label)
  }

  // Starts a new collapsed log group; in Node.js identical to `group()`.
  // https://nodejs.org/api/console.html#consolegroupcollapsed.
  groupCollapsed(...label: unknown[]): this {
    return ReflectApply(this.group, this, label)
  }

  // Ends the current log group and decreases indentation. See groupEndMethod.
  groupEnd() {
    return groupEndMethod(this)
  }

  // Increases the indentation level by `spaces` (default 2, capped at 1000).
  // See indentMethod.
  indent(spaces = 2) {
    return indentMethod(this, this.#indentCtx(), spaces)
  }

  // Logs an info message with the blue `LOG_SYMBOLS.info` symbol to stderr. See
  // symbolApplyMethod.
  info(...args: unknown[]): this {
    return this.#symbol('info', args)
  }

  // Logs a message to stdout with current indentation, like `console.log()`.
  // The primary output method.
  log(...args: unknown[]): this {
    return this.#apply('log', args)
  }

  // Logs a newline to stdout unless the last line was already blank.
  logNewline() {
    return this.#getLastWasBlank('stdout') ? this : this.log('')
  }

  // Shows a `∴`-prefixed progress indicator, clearable with `clearLine()`. See
  // progressMethod.
  progress(text: string): this {
    return progressMethod(
      this,
      this.#getConsole(),
      this.#getTargetStream(),
      this.#getSymbols(),
      text,
    )
  }

  // Resets all indentation to zero (both streams on the root; the bound stream
  // otherwise). See resetIndentMethod.
  resetIndent() {
    return resetIndentMethod(this, this.#indentCtx())
  }

  // Logs a skip message with the cyan `LOG_SYMBOLS.skip` (↻) symbol to stderr.
  // See symbolApplyMethod.
  skip(...args: unknown[]): this {
    return this.#symbol('skip', args)
  }

  // Logs a main step message with the `LOG_SYMBOLS.step` (→) symbol to stdout,
  // adding a blank line before it unless the last line was already blank. See
  // stepMethod.
  step(msg: string, ...extras: unknown[]): this {
    // Add blank line before the step message (tracked via this.log).
    if (!this.#getLastWasBlank('stdout')) {
      this.log('')
    }
    return stepMethod(
      this,
      this.#getConsole(),
      this.#getIndent('stdout'),
      this.#getSymbols(),
      msg,
      extras,
    )
  }

  // Logs a stateless substep: a 2-space-indented line that doesn't change
  // indentation state.
  substep(msg: string, ...extras: unknown[]): this {
    return this.log(`  ${msg}`, ...extras)
  }

  // Logs a success message with the green `LOG_SYMBOLS.success` (✔) symbol to
  // stderr. See symbolApplyMethod.
  success(...args: unknown[]): this {
    return this.#symbol('success', args)
  }

  // Displays data in a table format. See tableMethod.
  table(
    tabularData: unknown,
    properties?: readonly string[] | undefined,
  ): this {
    return tableMethod(this, this.#getConsole(), tabularData, properties)
  }

  // Starts a timer for measuring elapsed time. See timeMethod.
  time(label?: string | undefined): this {
    return timeMethod(this, this.#getConsole(), label)
  }

  // Ends a timer and logs the elapsed time. See timeEndMethod.
  timeEnd(label?: string | undefined): this {
    return timeEndMethod(this, this.#getConsole(), label)
  }

  // Logs the current value of a timer without stopping it. See timeLogMethod.
  timeLog(label?: string | undefined, ...data: unknown[]): this {
    return timeLogMethod(this, this.#getConsole(), label, data)
  }

  // Logs a stack trace to the console. See traceMethod.
  trace(message?: unknown | undefined, ...args: unknown[]): this {
    return traceMethod(this, this.#getConsole(), message, args)
  }

  // Logs a warning message with the yellow `LOG_SYMBOLS.warn` (⚠) symbol to
  // stderr. See symbolApplyMethod.
  warn(...args: unknown[]): this {
    return this.#symbol('warn', args)
  }

  // Writes text directly to stdout, no newline or indentation, bypassing
  // Console formatting. See writeMethod.
  write(text: string): this {
    return writeMethod(
      this,
      this.#getConsole(),
      this.#originalStdout,
      privateConstructorArgs.get(this) ?? [],
      text,
    )
  }
}
