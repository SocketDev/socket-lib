/**
 * @file Node-side `Logger` class — owns the per-instance state (parent, bound
 *   stream, indent buffers, theme), the symbol-prefixed semantic methods
 *   (`success`, `fail`, `info`, ...), and the chainable wrappers around the
 *   underlying `node:console` methods. The shared-default singleton lives in
 *   `./default`; this file exports only the class. Consumers should import
 *   `Logger` from `./logger` (auto-routed by the package.json `browser`
 *   condition); `./node` is the explicit Node entry, useful for tests pinning
 *   to one implementation. Console construction is deliberately lazy: the
 *   constructor only stashes its args in `_internal.privateConstructorArgs`;
 *   the actual `node:console` instance is built on first call to
 *   `#getConsole()`. This lets the logger be imported during early Node.js
 *   bootstrap before stdout is ready, avoiding `ERR_CONSOLE_WRITABLE_STREAM`.
 *   Free helpers live in sibling leaves (per `socket-lib`'s
 *   export-top-level-functions rule):
 *
 *   - color helpers — `./colors` (`applyColor`, `getYoctocolors`)
 *   - log symbols + symbol getters — `./symbols`
 *   - lazy console init + prototype mirror — `./console-init`
 *   - shared private state — `./_internal`
 */

import process from 'node:process'

import { ArrayPrototypeAt, ArrayPrototypeSlice } from '../primordials/array'

import { ErrorCtor } from '../primordials/error'

import { MathMin } from '../primordials/math'

import { ReflectApply } from '../primordials/reflect'

import { applyLinePrefix } from '../strings/format'
import { isBlankString } from '../strings/predicates'
import { getTheme } from '../themes/context'
import { THEMES } from '../themes/themes'

import {
  boundConsoleEntries,
  maxIndentation,
  privateConsole,
  privateConstructorArgs,
} from './_internal'
import { buildLoggerSymbols, stripLoggerSymbols } from './symbols-builder'
import {
  LOG_SYMBOLS,
  getKGroupIndentationWidthSymbol,
  incLogCallCountSymbol,
  lastWasBlankSymbol,
} from './symbols'

import { constructConsole, ensurePrototypeInitialized } from './console'
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
import { clearTerminalLine, resolveWriteStream } from './stream'

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
   * Creates a new Logger instance. Without arguments uses the default
   * `process.stdout` / `process.stderr`; accepts custom console constructor
   * arguments for advanced use cases.
   *
   * @param args - Optional console constructor arguments.
   */
  constructor(...args: unknown[]) {
    // Store constructor args for lazy Console initialization.
    privateConstructorArgs.set(this, args)

    // Store options if provided (for future extensibility)
    const options = args['0']
    if (typeof options === 'object' && options !== null) {
      this.#options = { __proto__: null, ...options }
      // Store reference to original stdout stream to bypass Console formatting
      this.#originalStdout = (
        options as { stdout?: NodeJS.WritableStream | undefined }
      ).stdout

      // Handle theme option
      const themeOption = (options as { theme?: unknown | undefined }).theme
      if (themeOption) {
        if (typeof themeOption === 'string') {
          // Theme name - resolve to Theme object
          const resolved = THEMES[themeOption as keyof typeof THEMES]
          if (resolved) {
            this.#theme = resolved
          }
        } else {
          // Theme object
          this.#theme = themeOption as Theme
        }
      }
    } else {
      this.#options = { __proto__: null }
    }

    // Note: Console initialization is now lazy (happens on first use).
    // This allows logger to be imported during early bootstrap before
    // stdout is ready, avoiding ERR_CONSOLE_WRITABLE_STREAM errors.
  }

  /**
   * Apply a console method with indentation.
   *
   * @private
   */
  #apply(
    methodName: string,
    args: unknown[],
    stream?: 'stderr' | 'stdout',
  ): this {
    const con = this.#getConsole()
    const text = ArrayPrototypeAt(args, 0)
    const hasText = typeof text === 'string'
    // Determine which stream this method writes to
    const targetStream = stream || (methodName === 'log' ? 'stdout' : 'stderr')
    const indent = this.#getIndent(targetStream)
    const logArgs = hasText
      ? [
          applyLinePrefix(text, { prefix: indent }),
          ...ArrayPrototypeSlice(args, 1),
        ]
      : args
    ReflectApply(
      con[methodName] as (...args: unknown[]) => unknown,
      con,
      logArgs,
    )
    this[lastWasBlankSymbol](hasText && isBlankString(logArgs[0]), targetStream)
    this[incLogCallCountSymbol]()
    return this
  }

  /**
   * Get the Console instance for this logger, creating it lazily on first
   * access.
   *
   * This lazy initialization allows the logger to be imported during early
   * Node.js bootstrap before stdout is ready, avoiding Console initialization
   * errors (ERR_CONSOLE_WRITABLE_STREAM).
   *
   * @private
   */
  #getConsole(): typeof console & Record<string, unknown> {
    // Ensure prototype is initialized before creating Console.
    ensurePrototypeInitialized()

    let con = privateConsole.get(this)
    // ctorArgs.length-truthy fires when caller seeded constructor args;
    // both arms exercised across tests but not always in the same run.
    /* c8 ignore start */
    if (!con) {
      const ctorArgs = privateConstructorArgs.get(this) ?? []
      if (ctorArgs.length) {
        con = constructConsole(...ctorArgs)
      } else {
        con = constructConsole({
          stdout: process.stdout,
          stderr: process.stderr,
        }) as typeof console & Record<string, unknown>
        for (const { 0: key, 1: method } of boundConsoleEntries) {
          con[key] = method
        }
      }
      privateConsole.set(this, con)
      privateConstructorArgs.delete(this)
    }
    /* c8 ignore stop */
    return con
  }

  /**
   * Get indentation for a specific stream.
   *
   * @private
   */
  #getIndent(stream: 'stderr' | 'stdout'): string {
    const root = this.#getRoot()
    return stream === 'stderr' ? root.#stderrIndention : root.#stdoutIndention
  }

  /**
   * Get lastWasBlank state for a specific stream.
   *
   * @private
   */
  #getLastWasBlank(stream: 'stderr' | 'stdout'): boolean {
    const root = this.#getRoot()
    return stream === 'stderr'
      ? root.#stderrLastWasBlank
      : root.#stdoutLastWasBlank
  }

  /**
   * Get the root logger (for accessing shared indentation state).
   *
   * @private
   */
  #getRoot(): Logger {
    return this.#parent || this
  }

  /**
   * Get logger-specific symbols using the resolved theme.
   *
   * @private
   */
  #getSymbols(): LogSymbols {
    return buildLoggerSymbols(this.#getTheme())
  }

  /**
   * Get the target stream for this logger instance.
   *
   * @private
   */
  #getTargetStream(): 'stderr' | 'stdout' {
    return this.#boundStream || 'stderr'
  }

  /**
   * Get the resolved theme for this logger instance. Returns instance theme if
   * set, otherwise falls back to context theme.
   *
   * @private
   */
  #getTheme(): Theme {
    return this.#theme ?? getTheme()
  }

  /**
   * Set indentation for a specific stream.
   *
   * @private
   */
  #setIndent(stream: 'stderr' | 'stdout', value: string): void {
    const root = this.#getRoot()
    if (stream === 'stderr') {
      root.#stderrIndention = value
    } else {
      root.#stdoutIndention = value
    }
  }

  /**
   * Set lastWasBlank state for a specific stream.
   *
   * @private
   */
  #setLastWasBlank(stream: 'stderr' | 'stdout', value: boolean): void {
    const root = this.#getRoot()
    if (stream === 'stderr') {
      root.#stderrLastWasBlank = value
    } else {
      root.#stdoutLastWasBlank = value
    }
  }

  /**
   * Strip log symbols from the start of text.
   *
   * @private
   */
  #stripSymbols(text: string): string {
    return stripLoggerSymbols(text)
  }

  /**
   * Apply a method with a symbol prefix.
   *
   * @private
   */
  #symbolApply(symbolType: string, args: unknown[]): this {
    const con = this.#getConsole()
    let text = ArrayPrototypeAt(args, 0)
    // biome-ignore lint/suspicious/noImplicitAnyLet: Flexible argument handling.
    let extras
    // text-non-string arm fires only when caller passes object first.
    /* c8 ignore start */
    if (typeof text === 'string') {
      text = this.#stripSymbols(text)
      extras = ArrayPrototypeSlice(args, 1)
    } else {
      extras = args
      text = ''
    }
    /* c8 ignore stop */
    // Note: Meta status messages (info/fail/etc) always go to stderr.
    const indent = this.#getIndent('stderr')
    const symbols = this.#getSymbols()
    con.error(
      applyLinePrefix(`${symbols[symbolType as keyof LogSymbols]} ${text}`, {
        prefix: indent,
      }),
      ...extras,
    )
    this[lastWasBlankSymbol](false, 'stderr')
    this[incLogCallCountSymbol]()
    return this
  }

  /**
   * Gets a logger instance bound exclusively to stderr. Indentation is tracked
   * separately from stdout; the instance is cached and reused.
   *
   * @returns A logger instance bound to stderr
   */
  get stderr(): Logger {
    if (!this.#stderrLogger) {
      // Pass parent's constructor args to maintain config.
      const ctorArgs = privateConstructorArgs.get(this) ?? []
      const instance = new Logger(...ctorArgs)
      instance.#parent = this
      instance.#boundStream = 'stderr'
      instance.#options = { __proto__: null, ...this.#options }
      if (this.#theme) {
        instance.#theme = this.#theme
      }
      this.#stderrLogger = instance
    }
    return this.#stderrLogger
  }

  /**
   * Gets a logger instance bound exclusively to stdout. Indentation is tracked
   * separately from stderr; the instance is cached and reused.
   *
   * @returns A logger instance bound to stdout
   */
  get stdout(): Logger {
    if (!this.#stdoutLogger) {
      // Pass parent's constructor args to maintain config.
      const ctorArgs = privateConstructorArgs.get(this) ?? []
      const instance = new Logger(...ctorArgs)
      instance.#parent = this
      instance.#boundStream = 'stdout'
      instance.#options = { __proto__: null, ...this.#options }
      if (this.#theme) {
        instance.#theme = this.#theme
      }
      this.#stdoutLogger = instance
    }
    return this.#stdoutLogger
  }

  /**
   * Gets the total number of log calls made on this logger instance. Tracks all
   * logging method calls; useful for testing and monitoring.
   *
   * @returns The number of times logging methods have been called
   */
  get logCallCount() {
    const root = this.#getRoot()
    return root.#logCallCount
  }

  /**
   * Increments the internal log call counter. Called automatically by logging
   * methods; not for direct use.
   */
  [incLogCallCountSymbol]() {
    const root = this.#getRoot()
    root.#logCallCount += 1
    return this
  }

  /**
   * Sets whether the last logged line was blank, tracking blank lines to
   * prevent duplicate spacing. Called automatically by logging methods.
   *
   * @param value - Whether the last line was blank.
   * @param stream - Optional stream to update (defaults to both streams if not
   *   bound, or target stream if bound)
   */
  [lastWasBlankSymbol](value: unknown, stream?: 'stderr' | 'stdout'): this {
    if (stream) {
      // Explicit stream specified
      this.#setLastWasBlank(stream, !!value)
    } else if (this.#boundStream) {
      // Stream-bound logger - affect only the bound stream
      this.#setLastWasBlank(this.#boundStream, !!value)
    } else {
      // Root logger with no stream specified - affect both streams
      this.#setLastWasBlank('stderr', !!value)
      this.#setLastWasBlank('stdout', !!value)
    }
    return this
  }

  /**
   * Logs an assertion failure message if the value is falsy. See
   * {@link assertMethod}.
   */
  assert(value: unknown, ...message: unknown[]): this {
    return assertMethod(this, this.#getConsole(), value, message)
  }

  /**
   * Clears the current line in the terminal (TTY and non-TTY). Useful for
   * clearing progress indicators created with `progress()`. The stream cleared
   * depends on whether the logger is stream-bound.
   */
  clearLine(): this {
    const con = this.#getConsole()
    const stream = this.#getTargetStream()
    clearTerminalLine(resolveWriteStream(con, stream))
    return this
  }

  /**
   * Clears the visible terminal screen. Only available on the main logger
   * instance, not stream-bound instances. Resets the log call count and blank
   * line tracking if the output is a TTY.
   *
   * @throws {Error} If called on a stream-bound logger instance
   */
  clearVisible() {
    /* c8 ignore start - clearVisible TTY-mode behavior; tests use
     non-TTY capture streams so the bound-stream throw and TTY
     clear branches aren't reached. */
    if (this.#boundStream) {
      throw new ErrorCtor(
        'clearVisible() is only available on the main logger instance, not on stream-bound instances',
      )
    }
    const con = this.#getConsole()
    con.clear()
    if ((con['_stdout'] as { isTTY?: boolean | undefined }).isTTY) {
      this[lastWasBlankSymbol](true)
      this.#logCallCount = 0
    }
    return this
    /* c8 ignore stop */
  }

  /**
   * Increments and logs a counter for the given label. See {@link countMethod}.
   */
  count(label?: string | undefined): this {
    return countMethod(this, this.#getConsole(), label)
  }

  /**
   * Creates a task whose `run()` method logs "Starting task: {name}" before
   * executing the provided function and "Completed task: {name}" after.
   *
   * @param name - The name of the task.
   *
   * @returns A task object with a `run()` method
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

  /**
   * Decreases the indentation level by removing spaces from the prefix. On the
   * main logger affects both streams; on a stream-bound logger affects only
   * that stream.
   *
   * @default 2
   */
  dedent(spaces = 2) {
    if (this.#boundStream) {
      // Only affect bound stream
      const current = this.#getIndent(this.#boundStream)
      this.#setIndent(this.#boundStream, current.slice(0, -spaces))
    } else {
      // Affect both streams
      const stderrCurrent = this.#getIndent('stderr')
      const stdoutCurrent = this.#getIndent('stdout')
      this.#setIndent('stderr', stderrCurrent.slice(0, -spaces))
      this.#setIndent('stdout', stdoutCurrent.slice(0, -spaces))
    }
    return this
  }

  /**
   * Displays an object's properties in a formatted way. See {@link dirMethod}.
   */
  dir(obj: unknown, options?: unknown | undefined): this {
    return dirMethod(this, this.#getConsole(), obj, options)
  }

  /**
   * Displays data as XML/HTML in a formatted way. See {@link dirxmlMethod}.
   */
  dirxml(...data: unknown[]): this {
    return dirxmlMethod(this, this.#getConsole(), data)
  }

  /**
   * Logs a completion message with a success symbol (alias for `success()`).
   * Does NOT clear the current line; call `clearLine()` first if needed after
   * `progress()`.
   */
  done(...args: unknown[]): this {
    return this.#symbolApply('success', args)
  }

  /**
   * Logs an error message to stderr with current indentation, formatting
   * arguments like `console.error()`.
   */
  error(...args: unknown[]): this {
    return this.#apply('error', args)
  }

  /**
   * Logs a newline to stderr only if the last line wasn't already blank,
   * preventing multiple consecutive blank lines.
   */
  errorNewline() {
    return this.#getLastWasBlank('stderr') ? this : this.error('')
  }

  /**
   * Logs a failure message prefixed with the red `LOG_SYMBOLS.fail` symbol to
   * stderr. Existing leading symbols are stripped and replaced.
   */
  fail(...args: unknown[]): this {
    return this.#symbolApply('fail', args)
  }

  /**
   * Starts a new indented log group. A provided label is logged before
   * increasing indentation by `kGroupIndentWidth` (default 2). Groups nest;
   * call `groupEnd()` to close.
   *
   * @param label - Optional label to display before the group.
   */
  group(...label: unknown[]): this {
    const { length } = label
    if (length) {
      ReflectApply(this.log, this, label)
    }
    this.indent(
      (this as unknown as Record<symbol, number | undefined>)[
        getKGroupIndentationWidthSymbol()
      ],
    )
    if (length) {
      this[lastWasBlankSymbol](false)
      this[incLogCallCountSymbol]()
    }
    return this
  }

  /**
   * Starts a new collapsed log group (alias for `group()`). In Node.js behaves
   * identically to `group()`.
   *
   * @param label - Optional label to display before the group.
   */
  // groupCollapsed is an alias of group.
  // https://nodejs.org/api/console.html#consolegroupcollapsed
  groupCollapsed(...label: unknown[]): this {
    return ReflectApply(this.group, this, label)
  }

  /**
   * Ends the current log group and decreases indentation. Call once per
   * `group()` / `groupCollapsed()` to restore indentation.
   */
  groupEnd() {
    this.dedent(
      (this as unknown as Record<symbol, number | undefined>)[
        getKGroupIndentationWidthSymbol()
      ],
    )
    return this
  }

  /**
   * Increases the indentation level by adding spaces to the prefix. On the main
   * logger affects both streams; on a stream-bound logger affects only that
   * stream. Maximum indentation is 1000 spaces.
   *
   * @default 2
   */
  indent(spaces = 2) {
    const spacesToAdd = ' '.repeat(MathMin(spaces, maxIndentation))
    if (this.#boundStream) {
      // Only affect bound stream
      const current = this.#getIndent(this.#boundStream)
      this.#setIndent(this.#boundStream, current + spacesToAdd)
    } else {
      // Affect both streams
      const stderrCurrent = this.#getIndent('stderr')
      const stdoutCurrent = this.#getIndent('stdout')
      this.#setIndent('stderr', stderrCurrent + spacesToAdd)
      this.#setIndent('stdout', stdoutCurrent + spacesToAdd)
    }
    return this
  }

  /**
   * Logs an informational message prefixed with the blue `LOG_SYMBOLS.info`
   * symbol to stderr. Existing leading symbols are stripped and replaced.
   */
  info(...args: unknown[]): this {
    return this.#symbolApply('info', args)
  }

  /**
   * Logs a message to stdout with current indentation, formatting arguments
   * like `console.log()`. The primary method for standard output.
   */
  log(...args: unknown[]): this {
    return this.#apply('log', args)
  }

  /**
   * Logs a newline to stdout only if the last line wasn't already blank,
   * preventing multiple consecutive blank lines.
   */
  logNewline() {
    return this.#getLastWasBlank('stdout') ? this : this.log('')
  }

  /**
   * Shows a progress indicator (a `∴`-prefixed status message) that can be
   * cleared with `clearLine()`. The output stream depends on whether the logger
   * is stream-bound. Always clears the current line first so repeated
   * `progress(...)` calls redraw cleanly: TTY uses `cursorTo(0) +
   * clearLine(0)`, non-TTY falls back to `\r\x1b[K` (still works in CI logs).
   *
   * @param text - The progress message to display.
   */
  progress(text: string): this {
    const con = this.#getConsole()
    const stream = this.#getTargetStream()
    const streamObj = resolveWriteStream(con, stream)
    clearTerminalLine(streamObj)
    const symbols = this.#getSymbols()
    streamObj.write(`${symbols.progress} ${text}`)
    this[lastWasBlankSymbol](false)
    return this
  }

  /**
   * Resets all indentation to zero.
   *
   * When called on the main logger, resets both stderr and stdout indentation.
   * When called on a stream-bound logger (`.stderr` or `.stdout`), resets only
   * that stream's indentation.
   */
  resetIndent() {
    if (this.#boundStream) {
      // Only reset bound stream
      this.#setIndent(this.#boundStream, '')
    } else {
      // Reset both streams
      this.#setIndent('stderr', '')
      this.#setIndent('stdout', '')
    }
    return this
  }

  /**
   * Logs a skip message with a cyan colored skip symbol.
   *
   * Automatically prefixes the message with `LOG_SYMBOLS.skip` (cyan ↻). Always
   * outputs to stderr. If the message starts with an existing symbol, it will
   * be stripped and replaced.
   */
  skip(...args: unknown[]): this {
    return this.#symbolApply('skip', args)
  }

  /**
   * Logs a main step message with a cyan arrow symbol and blank line before it.
   *
   * Automatically prefixes the message with `LOG_SYMBOLS.step` (cyan →) and
   * adds a blank line before the message unless the last line was already
   * blank. Useful for marking major steps in a process with clear visual
   * separation. Always outputs to stdout. If the message starts with an
   * existing symbol, it will be stripped and replaced.
   *
   * @param msg - The step message to log.
   * @param extras - Additional arguments to log.
   */
  step(msg: string, ...extras: unknown[]): this {
    // Add blank line before the step message.
    if (!this.#getLastWasBlank('stdout')) {
      // Use this.log() to properly track the blank line.
      this.log('')
    }
    // Strip existing symbols from the message.
    const text = this.#stripSymbols(msg)
    // Note: Step messages always go to stdout (unlike info/fail/etc which go to stderr).
    const indent = this.#getIndent('stdout')
    const symbols = this.#getSymbols()
    const con = this.#getConsole() as typeof console & Record<string, unknown>
    con.log(
      applyLinePrefix(`${symbols.step} ${text}`, {
        prefix: indent,
      }),
      ...extras,
    )
    this[lastWasBlankSymbol](false, 'stdout')
    this[incLogCallCountSymbol]()
    return this
  }

  /**
   * Logs an indented substep message (stateless).
   *
   * Adds a 2-space indent to the message without affecting the logger's
   * indentation state. Useful for showing sub-items under a main step.
   *
   * @param msg - The substep message to log.
   * @param extras - Additional arguments to log.
   */
  substep(msg: string, ...extras: unknown[]): this {
    // Add 2-space indent to the message.
    const indentedMsg = `  ${msg}`
    // Let log() handle all tracking.
    return this.log(indentedMsg, ...extras)
  }

  /**
   * Logs a success message with a green colored success symbol.
   *
   * Automatically prefixes the message with `LOG_SYMBOLS.success` (green ✔).
   * Always outputs to stderr. If the message starts with an existing symbol, it
   * will be stripped and replaced.
   */
  success(...args: unknown[]): this {
    return this.#symbolApply('success', args)
  }

  /**
   * Displays data in a table format. See {@link tableMethod}.
   */
  table(
    tabularData: unknown,
    properties?: readonly string[] | undefined,
  ): this {
    return tableMethod(this, this.#getConsole(), tabularData, properties)
  }

  /**
   * Starts a timer for measuring elapsed time. See {@link timeMethod}.
   */
  time(label?: string | undefined): this {
    return timeMethod(this, this.#getConsole(), label)
  }

  /**
   * Ends a timer and logs the elapsed time. See {@link timeEndMethod}.
   */
  timeEnd(label?: string | undefined): this {
    return timeEndMethod(this, this.#getConsole(), label)
  }

  /**
   * Logs the current value of a timer without stopping it. See
   * {@link timeLogMethod}.
   */
  timeLog(label?: string | undefined, ...data: unknown[]): this {
    return timeLogMethod(this, this.#getConsole(), label, data)
  }

  /**
   * Logs a stack trace to the console. See {@link traceMethod}.
   */
  trace(message?: unknown | undefined, ...args: unknown[]): this {
    return traceMethod(this, this.#getConsole(), message, args)
  }

  /**
   * Logs a warning message with a yellow colored warning symbol.
   *
   * Automatically prefixes the message with `LOG_SYMBOLS.warn` (yellow ⚠).
   * Always outputs to stderr. If the message starts with an existing symbol, it
   * will be stripped and replaced.
   */
  warn(...args: unknown[]): this {
    return this.#symbolApply('warn', args)
  }

  /**
   * Writes text directly to stdout without a newline or indentation.
   *
   * Useful for progress indicators or custom formatting where you need
   * low-level control. Does not apply any indentation or formatting.
   *
   * @param text - The text to write.
   */
  write(text: string): this {
    const con = this.#getConsole()
    // Write directly to the original stdout stream to bypass Console
    // formatting. The two fallback arms (ctorArgs.stdout, then
    // con._stdout) only fire when #originalStdout wasn't seeded, which
    // most Logger instances avoid by passing options.
    const ctorArgs = privateConstructorArgs.get(this) ?? []
    /* c8 ignore start */
    const stdout =
      this.#originalStdout ||
      (
        ctorArgs[0] as
          | { stdout?: NodeJS.WritableStream | undefined }
          | undefined
      )?.stdout ||
      (con as unknown as { _stdout: NodeJS.WritableStream })._stdout
    /* c8 ignore stop */
    stdout.write(text)
    this[lastWasBlankSymbol](false)
    return this
  }
}
