/**
 * @fileoverview Debug logging utilities with lazy loading and environment-based control.
 * Provides Socket CLI specific debug functionality and logging formatters.
 */

import { getDebug } from './env/debug'
import { getSocketDebug } from './env/socket'
import isUnicodeSupported from './external/@socketregistry/is-unicode-supported'
import debugJs from './external/debug'

import { getDefaultLogger } from './logger/default'
import { hasOwn } from './objects/predicates'
import { ArrayPrototypeAt, ArrayPrototypeSlice } from './primordials/array'
import { DateNow } from './primordials/date'
import { MapCtor } from './primordials/map-set'
import { ReflectApply } from './primordials/reflect'
import {
  StringPrototypeSlice,
  StringPrototypeStartsWith,
} from './primordials/string'
import { getDefaultSpinner } from './spinner/registry'
import { applyLinePrefix } from './strings/format'

const logger = getDefaultLogger()

// Type definitions
interface DebugOptions {
  namespaces?: string
  spinner?: { isSpinning: boolean; stop(): void; start(): void }
  [key: string]: unknown
}

type NamespacesOrOptions = string | DebugOptions

interface InspectOptions {
  depth?: number | null
  colors?: boolean
  [key: string]: unknown
}

export type { DebugOptions, InspectOptions, NamespacesOrOptions }

const debugByNamespace = new MapCtor()

let _util: typeof import('node:util') | undefined

let pointingTriangle: string | undefined

/**
 * Custom log function for debug output.
 * @private
 */
/* c8 ignore start - customLog is assigned to debugJs instances and
   only fires when debugJs emits, which requires DEBUG=* env var
   set at the right module-load timing. Tests use the SOCKET_DEBUG
   path which writes via logger.info directly. */
/*@__NO_SIDE_EFFECTS__*/
export function customLog(...args: unknown[]) {
  const util = getUtil()
  const inspectOpts = debugJs.inspectOpts
    ? {
        ...debugJs.inspectOpts,
        showHidden:
          debugJs.inspectOpts.showHidden === null
            ? undefined
            : debugJs.inspectOpts.showHidden,
        depth:
          debugJs.inspectOpts.depth === null ||
          typeof debugJs.inspectOpts.depth === 'boolean'
            ? undefined
            : debugJs.inspectOpts.depth,
      }
    : {}
  ReflectApply(logger.info, logger, [
    util.formatWithOptions(inspectOpts, ...args),
  ])
}
/* c8 ignore stop */

/**
 * Debug output with caller info (wrapper for debugNs with default namespace).
 */
export function debug(...args: unknown[]): void {
  debugNs('*', ...args)
}

/**
 * Cache debug function with caller info.
 *
 * @example
 * ```typescript
 * debugCache('hit', 'socket-sdk:scans:abc123')
 * debugCache('miss', 'socket-sdk:scans:xyz', { ttl: 60000 })
 * ```
 */
/*@__NO_SIDE_EFFECTS__*/
export function debugCache(
  operation: string,
  key: string,
  meta?: unknown | undefined,
): void {
  if (!getSocketDebug()) {
    return
  }
  // Get caller info with stack offset of 3 (caller -> debugCache -> getCallerInfo).
  // 'cache' fallback fires only on anonymous frames (V8 stack frame
  // matcher returns empty when the caller has no name, e.g. an arrow
  // function passed inline).
  /* c8 ignore start */
  const callerName = getCallerInfo(3) || 'cache'
  /* c8 ignore stop */

  // First-call init for module-level pointingTriangle; only one of
  // the 5 debug functions hits the body. The unicode-fallback arm
  // also fires only on terminals without unicode support.
  /* c8 ignore start */
  if (pointingTriangle === undefined) {
    const supported = isUnicodeSupported()
    pointingTriangle = supported ? '▸' : '>'
  }
  /* c8 ignore stop */

  const prefix = `[CACHE] ${callerName} ${pointingTriangle} ${operation}: ${key}`
  const args = meta !== undefined ? [prefix, meta] : [prefix]
  ReflectApply(logger.info, logger, args)
}

/**
 * Debug output for cache operations with caller info.
 * First argument is the operation type (hit/miss/set/clear).
 * Second argument is the cache key or message.
 * Optional third argument is metadata object.
 */
export function debugCacheNs(
  namespacesOrOpts: NamespacesOrOptions,
  operation: string,
  key: string,
  meta?: unknown | undefined,
) {
  const options = extractOptions(namespacesOrOpts)
  const { namespaces } = options
  if (!isEnabled(namespaces as string)) {
    return
  }
  // Get caller info with stack offset of 4 (caller -> debugCacheNs -> getCallerInfo).
  // 'cache' fallback fires only on anonymous frames.
  /* c8 ignore start */
  const callerName = getCallerInfo(4) || 'cache'
  /* c8 ignore stop */

  // First-call init for module-level pointingTriangle; only one of
  // the 5 debug functions hits the body. The unicode-fallback arm
  // also fires only on terminals without unicode support.
  /* c8 ignore start */
  if (pointingTriangle === undefined) {
    const supported = isUnicodeSupported()
    pointingTriangle = supported ? '▸' : '>'
  }
  /* c8 ignore stop */

  const prefix = `[CACHE] ${callerName} ${pointingTriangle} ${operation}: ${key}`
  const logArgs = meta !== undefined ? [prefix, meta] : [prefix]

  const spinnerInstance = options.spinner || getDefaultSpinner()
  const wasSpinning = spinnerInstance?.isSpinning
  spinnerInstance?.stop()
  ReflectApply(logger.info, logger, logArgs)
  if (wasSpinning) {
    spinnerInstance?.start()
  }
}

/**
 * Debug output for object inspection (wrapper for debugDirNs with default namespace).
 */
export function debugDir(
  obj: unknown,
  inspectOpts?: InspectOptions | undefined,
): void {
  debugDirNs('*', obj, inspectOpts)
}

/**
 * Debug output for object inspection with caller info.
 */
export function debugDirNs(
  namespacesOrOpts: NamespacesOrOptions,
  obj: unknown,
  inspectOpts?: InspectOptions | undefined,
) {
  const options = extractOptions(namespacesOrOpts)
  const { namespaces } = options
  if (!isEnabled(namespaces as string)) {
    return
  }
  // Get caller info with stack offset of 4 (caller -> debugDirNs -> getCallerInfo).
  // 'anonymous' fallback fires only on anonymous frames.
  /* c8 ignore start */
  const callerName = getCallerInfo(4) || 'anonymous'
  /* c8 ignore stop */

  // First-call init for module-level pointingTriangle; only one of
  // the 5 debug functions hits the body. The unicode-fallback arm
  // also fires only on terminals without unicode support.
  /* c8 ignore start */
  if (pointingTriangle === undefined) {
    const supported = isUnicodeSupported()
    pointingTriangle = supported ? '▸' : '>'
  }
  /* c8 ignore stop */

  let opts: InspectOptions | undefined = inspectOpts
  // External debug library inspection options. Only fires when the
  // caller omits inspectOpts AND debugJs has populated its global
  // inspectOpts (DEBUG_INSPECT_OPTIONS env var, etc.) — not the
  // common test path.
  /* c8 ignore start */
  if (opts === undefined) {
    const debugOpts = debugJs.inspectOpts
    if (debugOpts) {
      opts = {
        ...debugOpts,
        showHidden:
          debugOpts.showHidden === null ? undefined : debugOpts.showHidden,
        depth:
          debugOpts.depth === null || typeof debugOpts.depth === 'boolean'
            ? undefined
            : debugOpts.depth,
      } as InspectOptions
    }
  }
  /* c8 ignore stop */
  const spinnerInstance = options.spinner || getDefaultSpinner()
  const wasSpinning = spinnerInstance?.isSpinning
  spinnerInstance?.stop()
  logger.info(`[DEBUG] ${callerName} ${pointingTriangle} object inspection:`)
  logger.dir(obj, inspectOpts)
  if (wasSpinning) {
    spinnerInstance?.start()
  }
}

/**
 * Debug logging function (wrapper for debugLogNs with default namespace).
 */
export function debugLog(...args: unknown[]): void {
  debugLogNs('*', ...args)
}

/**
 * Debug logging function with caller info.
 */
export function debugLogNs(
  namespacesOrOpts: NamespacesOrOptions,
  ...args: unknown[]
) {
  const options = extractOptions(namespacesOrOpts)
  const { namespaces } = options
  if (!isEnabled(namespaces as string)) {
    return
  }
  // Get caller info with stack offset of 4 (caller -> debugLogNs -> getCallerInfo).
  // 'anonymous' fallback fires only on anonymous frames.
  /* c8 ignore start */
  const callerName = getCallerInfo(4) || 'anonymous'
  /* c8 ignore stop */

  // First-call init for module-level pointingTriangle; only one of
  // the 5 debug functions hits the body. The unicode-fallback arm
  // also fires only on terminals without unicode support.
  /* c8 ignore start */
  if (pointingTriangle === undefined) {
    const supported = isUnicodeSupported()
    pointingTriangle = supported ? '▸' : '>'
  }
  /* c8 ignore stop */

  const text = ArrayPrototypeAt(args, 0)
  const logArgs =
    typeof text === 'string'
      ? [
          applyLinePrefix(`${callerName} ${pointingTriangle} ${text}`, {
            prefix: '[DEBUG] ',
          }),
          ...ArrayPrototypeSlice(args, 1),
        ]
      : [`[DEBUG] ${callerName} ${pointingTriangle}`, ...args]

  const spinnerInstance = options.spinner || getDefaultSpinner()
  const wasSpinning = spinnerInstance?.isSpinning
  spinnerInstance?.stop()
  ReflectApply(logger.info, logger, logArgs)
  if (wasSpinning) {
    spinnerInstance?.start()
  }
}

/**
 * Debug output with caller info.
 */
export function debugNs(
  namespacesOrOpts: NamespacesOrOptions,
  ...args: unknown[]
) {
  const options = extractOptions(namespacesOrOpts)
  const { namespaces } = options
  if (!isEnabled(namespaces as string)) {
    return
  }
  // Get caller info with stack offset of 4 (caller -> debugNs -> getCallerInfo).
  // 'anonymous' fallback fires only on anonymous frames.
  /* c8 ignore start */
  const name = getCallerInfo(4) || 'anonymous'
  /* c8 ignore stop */
  // First-call init for module-level pointingTriangle; only one of
  // the 5 debug functions hits the body. The unicode-fallback arm
  // also fires only on terminals without unicode support.
  /* c8 ignore start */
  if (pointingTriangle === undefined) {
    const supported = isUnicodeSupported()
    pointingTriangle = supported ? '▸' : '>'
  }
  /* c8 ignore stop */
  const text = ArrayPrototypeAt(args, 0)
  const logArgs =
    typeof text === 'string'
      ? [
          applyLinePrefix(`${name} ${pointingTriangle} ${text}`, {
            prefix: '[DEBUG] ',
          }),
          ...ArrayPrototypeSlice(args, 1),
        ]
      : args
  const spinnerInstance = options.spinner || getDefaultSpinner()
  const wasSpinning = spinnerInstance?.isSpinning
  spinnerInstance?.stop()
  ReflectApply(logger.info, logger, logArgs)
  if (wasSpinning) {
    spinnerInstance?.start()
  }
}

/**
 * Create a Node.js util.debuglog compatible function.
 * Returns a function that conditionally writes debug messages to stderr.
 */
/*@__NO_SIDE_EFFECTS__*/
export function debuglog(section: string) {
  const util = getUtil()
  return util.debuglog(section)
}

/**
 * Create timing functions for measuring code execution time.
 * Returns an object with start() and end() methods, plus a callable function.
 */
/*@__NO_SIDE_EFFECTS__*/
export function debugtime(label: string) {
  const util = getUtil()
  // Node.js util doesn't have debugtime - create a custom implementation
  let startTime: number | undefined
  const impl = () => {
    if (startTime === undefined) {
      startTime = DateNow()
    } else {
      const duration = DateNow() - startTime
      util.debuglog('time')(`${label}: ${duration}ms`)
      startTime = undefined
    }
  }
  impl.start = () => {
    startTime = DateNow()
  }
  impl.end = () => {
    if (startTime !== undefined) {
      const duration = DateNow() - startTime
      util.debuglog('time')(`${label}: ${duration}ms`)
      startTime = undefined
    }
  }
  return impl
}

/**
 * Extract options from namespaces parameter.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
export function extractOptions(namespaces: NamespacesOrOptions): DebugOptions {
  return namespaces !== null && typeof namespaces === 'object'
    ? ({ __proto__: null, ...namespaces } as DebugOptions)
    : ({ __proto__: null, namespaces } as DebugOptions)
}

/**
 * Extract caller information from the stack trace.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
export function getCallerInfo(stackOffset: number = 3): string {
  let name = ''
  const captureStackTrace = Error.captureStackTrace
  // V8 always exposes captureStackTrace; non-function branch fires only
  // on exotic embedders that strip Error.captureStackTrace.
  /* c8 ignore start */
  if (typeof captureStackTrace === 'function') {
    const obj: { stack?: unknown } = {}
    captureStackTrace(obj, getCallerInfo)
    const stack = obj.stack
    // obj.stack is always a string after captureStackTrace.
    if (typeof stack === 'string') {
      let lineCount = 0
      let lineStart = 0
      for (let i = 0, { length } = stack; i < length; i += 1) {
        if (stack[i] === '\n') {
          lineCount += 1
          if (lineCount < stackOffset) {
            // Store the start index of the next line.
            lineStart = i + 1
          } else {
            // Extract the full line and trim it.
            const line = stack.slice(lineStart, i).trimStart()
            // Match the function name portion (e.g., "async runFix").
            const match = /(?<=^at\s+).*?(?=\s+\(|$)/.exec(line)?.[0]
            /* c8 ignore next - Defensive guard; real V8 stack frames
               always start with 'at '. */
            if (match) {
              name = match
                // Strip known V8 invocation prefixes to get the name.
                .replace(/^(?:async|bound|get|new|set)\s+/, '')
              // V8-specific 'Object.' stack frame prefix; only fires
              // for stack frames in object literal method calls.
              if (StringPrototypeStartsWith(name, 'Object.')) {
                // Strip leading 'Object.' if not an own property of Object.
                const afterDot = StringPrototypeSlice(name, 7)
                if (!hasOwn(Object, afterDot)) {
                  name = afterDot
                }
              }
            }
            break
          }
        }
      }
    }
  }
  /* c8 ignore stop */
  return name
}

/**
 * Get or create a debug instance for a namespace.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
export function getDebugJsInstance(namespace: string) {
  let inst = debugByNamespace.get(namespace)
  // Per-namespace cache hit; first-call always misses. Same-namespace
  // hit fires only when isEnabled() reuses the cached probe.
  /* c8 ignore start */
  if (inst) {
    return inst
  }
  if (
    !getDebug() &&
    getSocketDebug() &&
    (namespace === 'error' || namespace === 'notice')
  ) {
    debugJs.enable(namespace)
  }
  /* c8 ignore stop */
  /* c8 ignore next - External debug library call */
  inst = debugJs(namespace)
  inst.log = customLog
  debugByNamespace.set(namespace, inst)
  return inst
}

/**
 * Lazily load the util module.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
export function getUtil() {
  if (_util === undefined) {
    // Use non-'node:' prefixed require to avoid Webpack errors.

    _util = /*@__PURE__*/ require('node:util')
  }
  return _util as typeof import('node:util')
}

/**
 * Check if debug mode is enabled.
 */
/*@__NO_SIDE_EFFECTS__*/
export function isDebug(): boolean {
  return !!getSocketDebug()
}

/**
 * Check if debug mode is enabled.
 */
/*@__NO_SIDE_EFFECTS__*/
export function isDebugNs(namespaces: string | undefined): boolean {
  return !!getSocketDebug() && isEnabled(namespaces)
}

/**
 * Check if debug is enabled for given namespaces.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
export function isEnabled(namespaces: string | undefined) {
  // Check if debugging is enabled at all
  if (!getSocketDebug()) {
    return false
  }
  if (typeof namespaces !== 'string' || !namespaces || namespaces === '*') {
    return true
  }
  // Namespace splitting logic is based the 'debug' package implementation:
  // https://github.com/debug-js/debug/blob/4.4.1/src/common.js#L169-L173.
  const split = namespaces
    .trim()
    .replace(/\s+/g, ',')
    .split(',')
    .filter(Boolean)
  const names = []
  const skips = []
  for (const ns of split) {
    if (StringPrototypeStartsWith(ns, '-')) {
      skips.push(ns.slice(1))
    } else {
      names.push(ns)
    }
  }
  if (names.length && !names.some(ns => getDebugJsInstance(ns).enabled)) {
    return false
  }
  return skips.every(ns => !getDebugJsInstance(ns).enabled)
}
