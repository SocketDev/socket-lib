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
 *   `require` is DIRECTORY-SPECIFIC: `createRequire(base)` resolves relative
 *   specifiers (`./x`, `../y`) from `base`'s directory. For builtins and bare
 *   packages that's irrelevant (they resolve the same anywhere), so the cached
 *   `getRequire` / `requireBuiltin` bind to THIS file. A RELATIVE specifier
 *   must resolve from the CALLER's directory, so use `requireFrom` with the
 *   caller's `import.meta.url` — binding such a load to this file would resolve
 *   it against `src/node/` instead. Bundled, every module collapses to one base
 *   and either works; unbundled (e.g. AOT-compiled from source), each module
 *   sits at its own nested path and the base matters.
 */

// oxlint-disable-next-line unicorn/prefer-node-protocol -- bare `module` is browser-stubbable (resolve.fallback / browser field); a `node:` prefix breaks browser bundles. Named exports resolve on Node + Perry.
// eslint-disable-next-line n/prefer-node-protocol
import { createRequire, isBuiltin as nodeIsBuiltin } from 'module'
// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeModule from 'node:module'

import { IS_NODE } from '../constants/runtime'

let cachedModule: typeof NodeModule | undefined
let cachedRequire: ((id: string) => unknown) | undefined

/**
 * Bind a working `require`. Ambient `require` exists in CommonJS; in ESM and
 * ahead-of-time-compiled package modules it is unbound (reading it throws or
 * yields undefined), so fall back to `createRequire`. Returns undefined off
 * Node and in browsers, where neither is available.
 *
 * `fromUrl` sets the resolution base — pass a caller's `import.meta.url` to
 * resolve that caller's RELATIVE specifiers. When omitted, the base is this
 * file, which is correct only for builtins / bare packages (dir-independent).
 * With `fromUrl` the ambient `require` is skipped: it is bound to THIS file, so
 * it would resolve a relative specifier from the wrong directory.
 */
export function bindRequire(
  fromUrl?: string | undefined,
): ((id: string) => unknown) | undefined {
  if (!IS_NODE) {
    return undefined
  }
  if (!fromUrl && typeof require === 'function') {
    return require
  }
  if (typeof createRequire === 'function') {
    try {
      return createRequire(fromUrl ?? import.meta.url) as (
        id: string,
      ) => unknown
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
 * Returns a working `require` bound to THIS file, binding one on first call
 * (see bindRequire). Cached across calls; undefined off Node / in browsers.
 *
 * For builtins and bare packages only — the resolution base is this file, so a
 * relative specifier would resolve from `src/node/`. Use `requireFrom` for
 * relative loads.
 */
export function getRequire(): ((id: string) => unknown) | undefined {
  if (cachedRequire === undefined) {
    cachedRequire = bindRequire()
  }
  return cachedRequire
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
 * Builtins / bare packages only (dir-independent); for a relative specifier use
 * `requireFrom`. Used by `getNodeModule` for `node:module`, and by the
 * smol-binding loaders for the optional `node:smol-*` native bindings (gated
 * behind `isNodeBuiltin`, true only on socket-btm's smol Node binary).
 */
export function requireBuiltin(specifier: string): unknown {
  const req = getRequire()
  if (req) {
    return req(specifier)
  }
  return undefined
}

/**
 * Load a module by specifier from a CALLER-supplied base (its
 * `import.meta.url`). Use this for RELATIVE specifiers (`./x`, `../y`), whose
 * resolution depends on the caller's directory — `requireBuiltin` binds to this
 * file and would resolve them from `src/node/`. Not cached: the binding is
 * per-caller. Returns undefined where no `require` can be bound.
 */
export function requireFrom(fromUrl: string, specifier: string): unknown {
  const req = bindRequire(fromUrl)
  if (req) {
    return req(specifier)
  }
  return undefined
}
