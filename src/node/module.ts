/**
 * @file Accessors for `node:module` that work across runtimes. Ambient
 *   `require` is bound in CommonJS but unbound in ESM and inside
 *   ahead-of-time-compiled package modules (e.g. Perry), where reading it
 *   throws. And Perry's `require('module')` value omits `isBuiltin`. So instead
 *   of the ambient `require('module')` lazy-loader, `isBuiltin`/`createRequire`
 *   are imported as named values from the bare `module` specifier — which
 *   resolves on Node and Perry, and which browser bundlers can stub via
 *   resolve.fallback (a `node:` prefix would throw UnhandledSchemeError
 *   there).
 */

// oxlint-disable-next-line unicorn/prefer-node-protocol -- bare `module` is browser-stubbable (resolve.fallback / browser field); a `node:` prefix breaks browser bundles. Named exports resolve on Node + Perry.
// eslint-disable-next-line n/prefer-node-protocol
import { createRequire, isBuiltin as nodeIsBuiltin } from 'module'
// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeModule from 'node:module'

import { IS_NODE } from '../constants/runtime'

let cachedModule: typeof NodeModule | undefined
let cachedRequire: ((id: string) => unknown) | null | undefined

/**
 * Bind a working `require`. Ambient `require` exists in CommonJS; in ESM and
 * ahead-of-time-compiled package modules it is unbound (reading it throws or
 * yields undefined), so fall back to `createRequire(import.meta.url)`. Returns
 * null off Node and in browsers, where neither is available.
 */
export function bindRequire(): ((id: string) => unknown) | null {
  if (!IS_NODE) {
    return undefined
  }
  if (typeof require === 'function') {
    return require
  }
  if (typeof createRequire === 'function') {
    try {
      return createRequire(import.meta.url) as (id: string) => unknown
    } catch {
      return undefined
    }
  }
  return undefined
}

/**
 * Returns `node:module` (or undefined off Node), loaded through the bound
 * `require`. Cached across calls.
 */
export function getNodeModule(): typeof NodeModule {
  return (cachedModule ??= requireBuiltin('module') as typeof NodeModule)
}

/**
 * Returns a working `require`, binding one on first call (see bindRequire).
 * Cached across calls; undefined off Node / in browsers.
 */
export function getRequire(): ((id: string) => unknown) | undefined {
  if (cachedRequire === undefined) {
    cachedRequire = bindRequire()
  }
  return cachedRequire ?? undefined
}

/**
 * Is `name` a Node built-in module? Resolved from the statically-imported
 * `isBuiltin`, so it works on Node and on ahead-of-time-compiled binaries
 * (Perry), where ambient `require('module')` would lack `isBuiltin`. Returns
 * false in browsers, where the bare `module` import is stubbed away.
 *
 * Single source of truth for "is this a Node builtin?" probes across socket-lib
 * (used by the smol-binding loaders to gate their `node:smol-*` loads).
 */
export function isNodeBuiltin(name: string): boolean {
  if (!IS_NODE || typeof nodeIsBuiltin !== 'function') {
    return false
  }
  return nodeIsBuiltin(name)
}

/**
 * Load a built-in module by *computed* specifier through the bound `require`
 * (see getRequire). The specifier is a parameter — never a literal at the call
 * site — so browser bundlers neither walk nor bundle it. Returns undefined
 * where no `require` can be bound.
 *
 * Used by `getNodeModule` for `node:module`, and by the smol-binding loaders
 * for the optional `node:smol-*` native bindings (gated behind `isNodeBuiltin`,
 * true only on socket-btm's smol Node binary).
 */
export function requireBuiltin(specifier: string): unknown {
  const req = getRequire()
  if (!req) {
    return undefined
  }
  return req(specifier)
}
