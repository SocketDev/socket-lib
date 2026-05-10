/**
 * @fileoverview Module-singleton owner for the shared default
 * `Logger` instance. Kept in its own leaf so that callers who only
 * need the singleton (`getDefaultLogger()`) don't drag in the full
 * `Logger` class symbol table when tree-shaking; `core.ts` exports
 * the constructor for callers that need their own instance.
 *
 * Construction is lazy so that importing this module during early
 * Node.js bootstrap doesn't try to resolve `node:console` before
 * stdout is ready (mirrors the lazy `Console` init inside `Logger`
 * itself).
 */

import { Logger } from './core'

let _logger: Logger | undefined

/**
 * Get the default logger instance.
 * Lazily creates the logger to avoid circular dependencies during module initialization.
 * Reuses the same instance across calls.
 *
 * @returns Shared default logger instance
 *
 * @example
 * ```ts
 * import { getDefaultLogger } from '@socketsecurity/lib/logger/default'
 *
 * const logger = getDefaultLogger()
 * logger.log('Application started')
 * logger.success('Configuration loaded')
 * ```
 */
export function getDefaultLogger(): Logger {
  if (_logger === undefined) {
    _logger = new Logger()
  }
  return _logger
}
