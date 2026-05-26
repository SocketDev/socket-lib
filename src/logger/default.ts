/**
 * @file Shared-default `Logger` singleton. One process-wide instance,
 *   constructed lazily on first call so importing the module during early
 *   bootstrap doesn't try to resolve `node:console` before stdout is ready
 *   (Node side) or touch `globalThis.console` during a service-worker cold
 *   start (browser side). The `Logger` class itself comes from `./logger`,
 *   which the package.json `'browser'` condition routes to the right
 *   implementation per platform.
 */

import { Logger } from './logger'

let sharedLogger: Logger | undefined

export function getDefaultLogger(): Logger {
  if (sharedLogger === undefined) {
    sharedLogger = new Logger()
  }
  return sharedLogger
}
