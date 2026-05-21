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

import process from 'node:process'

import {
  ObjectDefineProperties,
  ObjectEntries,
  ObjectFromEntries,
} from '../primordials/object'

import { ReflectConstruct } from '../primordials/reflect'
import {
  boundConsoleEntries,
  consolePropAttributes,
  globalConsole,
  privateConsole,
  privateConstructorArgs,
} from './_internal'
import { Logger } from './default'
import { getKGroupIndentationWidthSymbol } from './symbols'

let _Console: typeof import('node:console').Console | undefined
let _prototypeInitialized = false

/**
 * Construct a new Console instance.
 */
/*@__NO_SIDE_EFFECTS__*/
export function constructConsole(...args: unknown[]) {
  /* c8 ignore next - Lazy-init second-call branch; module-singleton. */
  if (_Console === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    const nodeConsole = /*@__PURE__*/ require('node:console')
    _Console = nodeConsole.Console
  }
  return ReflectConstruct(
    _Console! as new (...args: unknown[]) => Console, // eslint-disable-line no-undef
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
  if (_prototypeInitialized) {
    return
  }
  _prototypeInitialized = true

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
    if (!(Logger.prototype as any)[key] && typeof value === 'function') {
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
              for (const { 0: k, 1: method } of boundConsoleEntries) {
                con[k] = method
              }
            }
            privateConsole.set(this, con)
          }
          /* c8 ignore stop */
          const result = (con as any)[key](...args)
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
