/**
 * @file Browser-safe `Logger` implementation — mirrors the public `success` /
 *   `fail` / `warn` / `error` / `info` / `log` surface of the Node `Logger`
 *   (see `./node`) but backed by the global `console` so it works in Chrome MV3
 *   service workers, content scripts, popups, and any other browser context
 *   without `node:process` / `node:console` / fs. Consumers should import
 *   `Logger` from `./logger` (auto-routed by the package.json `browser`
 *   condition) or `./default` for the singleton. `./browser` is the
 *   explicit-platform name; useful for tests pinning to one implementation.
 */

const SYM_SUCCESS = '✓' // oxlint-disable-line socket/no-status-emoji -- canonical logger owner
const SYM_FAIL = '✕' // oxlint-disable-line socket/no-status-emoji -- canonical logger owner
const SYM_WARN = '⚠' // oxlint-disable-line socket/no-status-emoji -- canonical logger owner
const SYM_INFO = 'ℹ' // oxlint-disable-line socket/no-status-emoji -- canonical logger owner

export class Logger {
  log(message: unknown, ...args: unknown[]): this {
    console.log(message, ...args) // oxlint-disable-line socket/no-console-prefer-logger -- canonical logger owner
    return this
  }

  info(message: unknown, ...args: unknown[]): this {
    console.log(SYM_INFO, message, ...args) // oxlint-disable-line socket/no-console-prefer-logger -- canonical logger owner
    return this
  }

  warn(message: unknown, ...args: unknown[]): this {
    console.warn(SYM_WARN, message, ...args) // oxlint-disable-line socket/no-console-prefer-logger -- canonical logger owner
    return this
  }

  error(message: unknown, ...args: unknown[]): this {
    console.error(SYM_FAIL, message, ...args) // oxlint-disable-line socket/no-console-prefer-logger -- canonical logger owner
    return this
  }

  success(message: unknown, ...args: unknown[]): this {
    console.log(SYM_SUCCESS, message, ...args) // oxlint-disable-line socket/no-console-prefer-logger -- canonical logger owner
    return this
  }

  fail(message: unknown, ...args: unknown[]): this {
    return this.error(message, ...args)
  }
}
