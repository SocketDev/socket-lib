/**
 * @file Namespace-handling helpers — `extractOptions` normalises the
 *   polymorphic first argument that every `*Ns` function takes,
 *   `getDebugJsInstance` per-namespace caches the underlying `debug-js`
 *   instance with `customLog` patched in, and `isEnabled` / `isDebug` /
 *   `isDebugNs` are the gate predicates every output function consults before
 *   writing.
 */

import { getDebug } from '../env/debug'
import { getSocketDebug } from '../env/socket'
import debugJs from '../external/debug'
import { StringPrototypeStartsWith } from '../primordials/string'

import { customLog, debugByNamespace } from './_internal'

import type { DebugOptions, NamespacesOrOptions } from './types'
import { envAsBoolean } from '@socketsecurity/lib-stable/env/boolean'

/**
 * Extract options from namespaces parameter.
 *
 * @private
 */
export function extractOptions(namespaces: NamespacesOrOptions): DebugOptions {
  return namespaces !== null && typeof namespaces === 'object'
    ? ({ __proto__: null, ...namespaces } as DebugOptions)
    : ({ __proto__: null, namespaces } as DebugOptions)
}

/**
 * Get or create a debug instance for a namespace.
 *
 * @private
 */
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
 * Check if debug mode is enabled.
 */
export function isDebug(): boolean {
  return envAsBoolean(getSocketDebug())
}

/**
 * Check if debug mode is enabled.
 */
export function isDebugNs(namespaces: string | undefined): boolean {
  return envAsBoolean(getSocketDebug()) && isEnabled(namespaces)
}

/**
 * Check if debug is enabled for given namespaces.
 *
 * @private
 */
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
