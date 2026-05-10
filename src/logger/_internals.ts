/**
 * @fileoverview Private state shared between the `logger/core` class
 * (which owns the public `Logger` surface) and `logger/console-init`
 * (which mutates `Logger.prototype` to mirror `globalConsole`). The
 * `_` prefix keeps this module out of the generated package.json
 * `exports` map (the `dist/**\/_*` ignore pattern in
 * `scripts/fix/generate-package-exports.mts` filters it out), so it is
 * not part of the public surface — it exists only to give the two
 * leaves above a common owner for the WeakMap-backed lazy-init state.
 *
 * Why two WeakMaps instead of `#privateField` slots:
 *   - Logger adds dynamic console methods to its prototype at first
 *     use (see `console-init.ts` `ensurePrototypeInitialized`). Those
 *     dynamic methods are constructed via the `{ [key]: function () }`
 *     shorthand and CANNOT access TC39 private fields on `this`.
 *   - WeakMaps work for both the static methods on the `Logger` class
 *     body AND the dynamically-attached prototype methods. WeakMap
 *     entries are GC'd alongside the `Logger` instance.
 *   - `privateConstructorArgs` is deleted after first `Console` build
 *     so we don't pin the original args for the lifetime of the logger.
 */

import { WeakMapCtor } from '../primordials'

/**
 * The global `console` reference captured at module load. Pinned to
 * a local so dynamic `console` overrides at runtime can't affect the
 * logger's source console (e.g., test rewiring of `globalThis.console`).
 */
export const globalConsole = console

/**
 * Property-descriptor template used when registering dynamic console
 * methods on `Logger.prototype`. Writable + configurable so tests can
 * override; non-enumerable so the methods don't leak into `for...in`
 * iteration on a logger instance.
 */
export const consolePropAttributes = {
  __proto__: null,
  writable: true,
  enumerable: false,
  configurable: true,
}

/**
 * Cap on the indentation prefix length so a runaway `indent(n)` call
 * with a huge `n` can't allocate a multi-megabyte string.
 */
export const maxIndentation = 1000

/**
 * Pre-bound copies of the console methods that need their original
 * `this` to function (e.g., `console.error.bind(globalConsole)`).
 * Mapping `[name, boundFn]` so `console-init.ts` can apply them onto
 * the per-instance Console without re-binding on every call.
 *
 * Notes from the upstream Node implementation:
 *   - `_stderrErrorHandler` / `_stdoutErrorHandler` are `kBindProperties`
 *     properties — they live on the per-instance Console and need
 *     their `this` set to `globalConsole`.
 *     https://github.com/nodejs/node/blob/v24.0.1/lib/internal/console/constructor.js#L230-L265
 *   - `group` / `groupCollapsed` / `groupEnd` are explicitly skipped
 *     because Node 20 with `--frozen-intrinsics` makes
 *     `Symbol(kGroupIndent)` read-only, which the Logger's own group
 *     methods avoid by tracking indentation at the prefix layer.
 */
export const boundConsoleEntries = [
  // Add bound properties from console[kBindProperties](ignoreErrors, colorMode, groupIndentation).
  // https://github.com/nodejs/node/blob/v24.0.1/lib/internal/console/constructor.js#L230-L265
  '_stderrErrorHandler',
  '_stdoutErrorHandler',
  // Add methods that need to be bound to function properly.
  'assert',
  'clear',
  'count',
  'countReset',
  'createTask',
  'debug',
  'dir',
  'dirxml',
  'error',
  // Skip group methods because in at least Node 20 with the Node --frozen-intrinsics
  // flag it triggers a readonly property for Symbol(kGroupIndent). Instead, we
  // implement these methods ourselves.
  //'group',
  //'groupCollapsed',
  //'groupEnd',
  'info',
  'log',
  'table',
  'time',
  'timeEnd',
  'timeLog',
  'trace',
  'warn',
]
  .filter(n => typeof (globalConsole as any)[n] === 'function')
  .map(n => [n, (globalConsole as any)[n].bind(globalConsole)])

/**
 * WeakMap storing the Console instance for each Logger.
 *
 * Console creation is lazy - deferred until first logging method call.
 * This allows logger to be imported during early Node.js bootstrap before
 * stdout is ready, avoiding ERR_CONSOLE_WRITABLE_STREAM errors.
 */
export const privateConsole = new WeakMapCtor()

/**
 * WeakMap storing constructor arguments for lazy Console initialization.
 *
 * WeakMap is required instead of a private field (#constructorArgs) because:
 * 1. Private fields can't be accessed from dynamically created functions
 * 2. Logger adds console methods dynamically to its prototype
 * 3. These dynamic methods need constructor args for lazy initialization
 * 4. WeakMap allows both regular methods and dynamic functions to access args
 *
 * The args are deleted from the WeakMap after Console is created (memory cleanup).
 */
export const privateConstructorArgs = new WeakMapCtor()
