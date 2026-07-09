/**
 * @file Lazy `Console` construction + dynamic prototype mirroring for `Logger`.
 *   Both helpers exist as free functions (rather than `Logger` static methods)
 *   because:
 *
 *   - `constructConsole` caches the resolved `node:console` module so multiple
 *     `new Logger()` calls don't pay the require cost more than once. Caching
 *     at the function level is simpler than a class field that has to thread
 *     through all callers.
 *   - `ensurePrototypeInitialized` walks `globalConsole` once at first use and
 *     copies any console method that isn't already on `Logger.prototype`. Doing
 *     this lazily (rather than at module load) is what lets the logger be
 *     imported during early Node.js bootstrap before stdout is ready, which
 *     would otherwise crash with `ERR_CONSOLE_WRITABLE_STREAM`. Note on the
 *     apparent circular import with `core.ts`: `ensurePrototypeInitialized`
 *     mutates `Logger.prototype`, so it imports `Logger` from `./core`.
 *     `core.ts` calls `ensurePrototypeInitialized()` from inside a method body,
 *     so the import cycle never resolves at module-load time — by the time
 *     `ensurePrototypeInitialized` actually runs, both modules are fully
 *     evaluated. Same pattern as `fs/path-cache` ↔ `fs/_internal`.
 */

// oxlint-disable-next-line unicorn/prefer-node-protocol -- bare `process` is browser-stubbable (resolve.fallback / browser field); a `node:` prefix throws UnhandledSchemeError in webpack browser bundles.
import process from 'process'

import type { Console } from 'node:console'

import {
  ObjectDefineProperties,
  ObjectEntries,
  ObjectFromEntries,
} from '../primordials/object'

import { ReflectConstruct } from '../primordials/reflect'
import {
  consolePropAttributes,
  getBoundConsoleEntries,
  globalConsole,
  privateConsole,
  privateConstructorArgs,
} from './_internal'
import { Logger } from './node'
import { getKGroupIndentationWidthSymbol } from './symbols'

let cachedConsole: typeof Console | undefined
let prototypeInitialized = false

/**
 * Construct a new Console instance.
 */
export function constructConsole(...args: unknown[]) {
  /* c8 ignore next - Lazy-init second-call branch; module-singleton. */
  if (cachedConsole === undefined) {
    // oxlint-disable-next-line unicorn/prefer-node-protocol -- bare `console` is browser-stubbable (resolve.fallback / browser field); a `node:` prefix throws UnhandledSchemeError in webpack browser bundles.
    const nodeConsole = /*@__PURE__*/ require('console')
    cachedConsole = nodeConsole.Console
  }
  return ReflectConstruct(
    cachedConsole! as new (...args: unknown[]) => Console,
    args,
  )
}

/**
 * Lazily add dynamic console methods to Logger prototype.
 *
 * This is deferred until first access to avoid calling
 * Object.entries(globalConsole) during early Node.js bootstrap before stdout is
 * ready.
 */
export function ensurePrototypeInitialized() {
  if (prototypeInitialized) {
    return
  }
  prototypeInitialized = true

  const entries: Array<[string | symbol, PropertyDescriptor]> = [
    [
      getKGroupIndentationWidthSymbol(),
      {
        ...consolePropAttributes,
        value: 2,
      },
    ],
    [
      Symbol.toStringTag,
      {
        __proto__: null,
        configurable: true,
        value: 'logger',
      } as PropertyDescriptor,
    ],
  ]
  for (const { 0: key, 1: value } of ObjectEntries(globalConsole)) {
    if (
      !(Logger.prototype as unknown as Record<string, unknown>)[key] &&
      typeof value === 'function'
    ) {
      // Dynamically name the log method without using Object.defineProperty.
      const { [key]: func } = {
        [key](this: Logger, ...args: unknown[]) {
          // Access Console via WeakMap directly since private methods can't
          // be called from dynamically created functions. con-undefined only
          // fires if someone calls a dynamically added console method before
          // any core logger method, which is rare.
          /* c8 ignore start */
          let con = privateConsole.get(this)
          if (con === undefined) {
            const ctorArgs = privateConstructorArgs.get(this) ?? []
            privateConstructorArgs.delete(this)
            if (ctorArgs.length) {
              con = constructConsole(...ctorArgs)
            } else {
              con = constructConsole({
                stdout: process.stdout,
                stderr: process.stderr,
              }) as typeof console & Record<string, unknown>
              for (const { 0: k, 1: method } of getBoundConsoleEntries()) {
                con[k] = method
              }
            }
            privateConsole.set(this, con)
          }
          /* c8 ignore stop */
          const consoleMethods = con as unknown as Record<
            string,
            (...methodArgs: unknown[]) => unknown
          >
          const result = consoleMethods[key]!(...args)
          // Most Console methods return undefined; the `=== con` chain
          // arm fires for builtin methods that return `this`.
          /* c8 ignore next */
          return result === undefined || result === con ? this : result
        },
      }
      entries.push([
        key,
        {
          ...consolePropAttributes,
          value: func,
        },
      ])
    }
  }
  ObjectDefineProperties(Logger.prototype, ObjectFromEntries(entries))
}

/**
 * Resolve (and lazily construct + cache) the per-instance `Console` for a
 * logger. Ensures the prototype is initialized, then returns the cached Console
 * from the `privateConsole` WeakMap, building one from the stored constructor
 * args (or the default stdout/stderr pair) on first access. This lazy path is
 * what lets the logger be imported during early Node.js bootstrap before stdout
 * is ready, avoiding `ERR_CONSOLE_WRITABLE_STREAM`.
 *
 * @param logger - The logger whose Console to resolve.
 */
export function resolveConsole(
  logger: Logger,
): typeof console & Record<string, unknown> {
  ensurePrototypeInitialized()

  let con = privateConsole.get(logger)
  /* c8 ignore start - ctorArgs.length-truthy fires when caller seeded
     constructor args; both arms are exercised across tests but not always
     in the same run. */
  if (!con) {
    const ctorArgs = privateConstructorArgs.get(logger) ?? []
    if (ctorArgs.length) {
      con = constructConsole(...ctorArgs)
    } else {
      con = constructConsole({
        stdout: process.stdout,
        stderr: process.stderr,
      }) as typeof console & Record<string, unknown>
      for (const { 0: key, 1: method } of getBoundConsoleEntries()) {
        con[key] = method
      }
    }
    privateConsole.set(logger, con)
    privateConstructorArgs.delete(logger)
  }
  /* c8 ignore stop */
  return con as typeof console & Record<string, unknown>
}
