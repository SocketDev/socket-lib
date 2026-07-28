/**
 * @file Output entrypoints — `debug` / `debugCache` / `debugDir` / `debugLog`
 *   and their `*Ns` namespace variants, plus `debuglog` (node-util-compatible)
 *   and `debugtime` (start/end timers). Each output function gates through
 *   `isEnabled`, prefixes the caller name from `getCallerInfo`, pauses any
 *   active spinner across the write, and uses the lazy `pointingTriangle` glyph
 *   for the divider.
 */

import { IS_NODE } from '../constants/runtime'
import { getDefaultLogger } from '../logger/default'
import { ArrayPrototypeAt, ArrayPrototypeSlice } from '../primordials/array'
import { DateNow } from '../primordials/date'
import { ReflectApply } from '../primordials/reflect'
import { getDefaultSpinner } from '../spinner/default'
import { applyLinePrefix } from '../strings/format'

import { getDebugJs, getPointingTriangle, getUtil } from './_internal'
import { getCallerInfo } from './caller-info'
import { extractOptions, isEnabled } from './namespace'

import { getSocketDebug } from '../env/socket'

import type { SpinnerInstance } from '../spinner/types'
import type { InspectOptions, NamespacesOrOptions } from './types'

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
 *   ;```typescript
 *   debugCache('hit', 'socket-sdk:scans:abc123')
 *   debugCache('miss', 'socket-sdk:scans:xyz', { ttl: 60000 })
 *   ```
 */
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

  const pointingTriangle = getPointingTriangle()
  const prefix = `[CACHE] ${callerName} ${pointingTriangle} ${operation}: ${key}`
  const args = meta !== undefined ? [prefix, meta] : [prefix]
  const logger = getDefaultLogger()
  ReflectApply(logger.info, logger, args)
}

/**
 * Debug output for cache operations with caller info. First argument is the
 * operation type (hit/miss/set/clear). Second argument is the cache key or
 * message. Optional third argument is metadata object.
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

  const pointingTriangle = getPointingTriangle()
  const prefix = `[CACHE] ${callerName} ${pointingTriangle} ${operation}: ${key}`
  const logArgs = meta !== undefined ? [prefix, meta] : [prefix]

  const spinnerInstance = options.spinner || getSpinner()
  const wasSpinning = spinnerInstance?.isSpinning
  spinnerInstance?.stop()
  const logger = getDefaultLogger()
  ReflectApply(logger.info, logger, logArgs)
  if (wasSpinning) {
    spinnerInstance?.start()
  }
}

/**
 * Debug output for object inspection (wrapper for debugDirNs with default
 * namespace).
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

  const pointingTriangle = getPointingTriangle()

  let opts: InspectOptions | undefined = inspectOpts
  // External debug library inspection options. Only fires when the
  // caller omits inspectOpts AND debugJs has populated its global
  // inspectOpts (DEBUG_INSPECT_OPTIONS env var, etc.) — not the
  // common test path.
  /* c8 ignore start - inspectOpts fallback needs DEBUG_INSPECT_OPTIONS env */
  if (opts === undefined) {
    const debugOpts = getDebugJs().inspectOpts
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
  const spinnerInstance = options.spinner || getSpinner()
  const wasSpinning = spinnerInstance?.isSpinning
  spinnerInstance?.stop()
  const logger = getDefaultLogger()
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

  const pointingTriangle = getPointingTriangle()
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

  const spinnerInstance = options.spinner || getSpinner()
  const wasSpinning = spinnerInstance?.isSpinning
  spinnerInstance?.stop()
  const logger = getDefaultLogger()
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
  const pointingTriangle = getPointingTriangle()
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
  const spinnerInstance = options.spinner || getSpinner()
  const wasSpinning = spinnerInstance?.isSpinning
  spinnerInstance?.stop()
  const logger = getDefaultLogger()
  ReflectApply(logger.info, logger, logArgs)
  if (wasSpinning) {
    spinnerInstance?.start()
  }
}

/**
 * Create a Node.js util.debuglog compatible function. Returns a function that
 * conditionally writes debug messages to stderr.
 */
export function debuglog(section: string) {
  const util = getUtil()
  return util.debuglog(section)
}

/**
 * Create timing functions for measuring code execution time. Returns an object
 * with start() and end() methods, plus a callable function.
 */
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
 * Resolve the default spinner on Node; off Node (browser bundles) there is no
 * spinner — callers no-op through their optional chains. Construction is
 * deferred to first debug write (every call site sits behind the `isEnabled`
 * / `getSocketDebug` gates), so a browser bundle never constructs the
 * node-bound spinner even when debug output is force-enabled.
 *
 * @private
 */
export function getSpinner(): SpinnerInstance | undefined {
  return IS_NODE ? getDefaultSpinner() : undefined
}
