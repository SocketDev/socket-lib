/**
 * @file Browser-safe Logger surface — minimal shim mirroring the public
 *   `success`/`fail`/`warn`/`error`/`info`/`log` methods of the full Node
 *   Logger, but backed by the global `console` so it works in Chrome MV3
 *   service workers, content scripts, popups, and any other browser context
 *   that doesn't have `node:process` / `node:console` / fs.
 */

export interface BrowserLogger {
  log(message: unknown, ...args: unknown[]): BrowserLogger
  info(message: unknown, ...args: unknown[]): BrowserLogger
  warn(message: unknown, ...args: unknown[]): BrowserLogger
  error(message: unknown, ...args: unknown[]): BrowserLogger
  success(message: unknown, ...args: unknown[]): BrowserLogger
  fail(message: unknown, ...args: unknown[]): BrowserLogger
}

const SYM_SUCCESS = '✓' // oxlint-disable-line socket/no-status-emoji -- canonical logger owner
const SYM_FAIL = '✕' // oxlint-disable-line socket/no-status-emoji -- canonical logger owner
const SYM_WARN = '⚠' // oxlint-disable-line socket/no-status-emoji -- canonical logger owner
const SYM_INFO = 'ℹ' // oxlint-disable-line socket/no-status-emoji -- canonical logger owner

class ConsoleBrowserLogger implements BrowserLogger {
  log(message: unknown, ...args: unknown[]): this {
    console.log(message, ...args)
    return this
  }

  info(message: unknown, ...args: unknown[]): this {
    console.log(SYM_INFO, message, ...args)
    return this
  }

  warn(message: unknown, ...args: unknown[]): this {
    console.warn(SYM_WARN, message, ...args)
    return this
  }

  error(message: unknown, ...args: unknown[]): this {
    console.error(SYM_FAIL, message, ...args)
    return this
  }

  success(message: unknown, ...args: unknown[]): this {
    console.log(SYM_SUCCESS, message, ...args)
    return this
  }

  fail(message: unknown, ...args: unknown[]): this {
    return this.error(message, ...args)
  }
}

let sharedLogger: BrowserLogger | undefined

export function getDefaultLogger(): BrowserLogger {
  if (!sharedLogger) {
    sharedLogger = new ConsoleBrowserLogger()
  }
  return sharedLogger
}
