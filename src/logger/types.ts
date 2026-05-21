/**
 * @file Public type surface for `logger/*` modules — the `LogSymbols` shape,
 *   the `LoggerMethods` mapped type that mirrors `console`, and the `Task`
 *   interface returned by `Logger.createTask`. Pure types; no runtime side
 *   effects so this module stays cheap to import everywhere.
 */

import type { Logger } from './default'

/**
 * Log symbols for terminal output with colored indicators.
 *
 * Each symbol provides visual feedback for different message types, with
 * Unicode and ASCII fallback support.
 *
 * @example
 *   ```typescript
 *   import { LOG_SYMBOLS } from '@socketsecurity/lib/logger/symbols'
 *
 *   console.log(`${LOG_SYMBOLS.success} Operation completed`)
 *   console.log(`${LOG_SYMBOLS.fail} Operation failed`)
 *   console.log(`${LOG_SYMBOLS.warn} Warning message`)
 *   console.log(`${LOG_SYMBOLS.info} Information message`)
 *   console.log(`${LOG_SYMBOLS.step} Processing step`)
 *   console.log(`${LOG_SYMBOLS.progress} Working on task`)
 *   ```
 */
export type LogSymbols = {
  /**
   * Red colored failure symbol (✖ or × in ASCII)
   */
  fail: string
  /**
   * Blue colored information symbol (ℹ or i in ASCII)
   */
  info: string
  /**
   * Cyan colored progress indicator symbol (∴ or :. in ASCII)
   */
  progress: string
  /**
   * Cyan colored skip symbol (↻ or @ in ASCII)
   */
  skip: string
  /**
   * Cyan colored step symbol (→ or > in ASCII)
   */
  step: string
  /**
   * Green colored success symbol (✔ or √ in ASCII)
   */
  success: string
  /**
   * Yellow colored warning symbol (⚠ or ‼ in ASCII)
   */
  warn: string
}

/**
 * Type definition for logger methods that mirror console methods.
 *
 * All methods return the logger instance for method chaining.
 */
export type LoggerMethods = {
  [K in keyof typeof console]: (typeof console)[K] extends (
    ...args: infer A
  ) => any
    ? (...args: A) => Logger
    : (typeof console)[K]
}

/**
 * A task that can be executed with automatic start/complete logging.
 *
 * @example
 *   ;```typescript
 *   const task = logger.createTask('Database migration')
 *   task.run(() => {
 *     // Migration logic here
 *   })
 *   // Logs: "Starting task: Database migration"
 *   // Logs: "Completed task: Database migration"
 *   ```
 */
export interface Task {
  /**
   * Executes the task function with automatic logging.
   *
   * @template T - The return type of the task function.
   *
   * @param f - The function to execute.
   *
   * @returns The result of the task function
   */
  run<T>(f: () => T): T
}
