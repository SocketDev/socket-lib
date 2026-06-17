/**
 * @file Lazy-loader for `node:module`. See `node/fs.ts` for the design
 *   rationale shared across all `node/*.ts` lazy-loaders.
 */

// eslint-disable-next-line n/prefer-node-protocol
import type * as NodeModule from 'node:module'

import { IS_NODE } from '../constants/runtime'

let cachedModule: typeof NodeModule | undefined

export function getNodeModule(): typeof NodeModule {
  // Skip in browser / non-Node runtimes — `node:module` is not available
  // there and the static require() call would throw at runtime or produce an
  // UNRESOLVED_IMPORT warning when a browser bundler walks the call.
  if (!IS_NODE) {
    return undefined as unknown as typeof NodeModule
  }
  return (cachedModule ??=
    // oxlint-disable-next-line unicorn/prefer-node-protocol -- bare specifier (not node:) so webpack resolve.fallback / browser-field can stub this builtin for browser bundles; node: prefix throws UnhandledSchemeError there
    /*@__PURE__*/ require('module') as typeof NodeModule)
}

/**
 * Lazy + cached reference to `node:module`'s `isBuiltin(name)`. First call
 * resolves the binding; subsequent calls dispatch through the cached function
 * reference. Safe to detach — `isBuiltin` is `this`-free.
 *
 * Returns `false` in browser / non-CJS environments where `require` is
 * undefined — no `node:` modules are built-in there.
 *
 * Single source of truth for "is this a Node builtin?" probes across socket-lib
 * (used by the smol-binding loaders to gate their `node:smol-*` loads).
 */
let cachedIsBuiltin: ((name: string) => boolean) | undefined
export function isNodeBuiltin(name: string): boolean {
  if (!IS_NODE) {
    return false
  }
  return (cachedIsBuiltin ??= getNodeModule()!.isBuiltin)(name)
}

/**
 * Load an optional `node:`-prefixed native builtin by *computed* specifier.
 *
 * The specifier arrives as a parameter, never a string literal at the
 * `require()` call site, so ahead-of-time bundlers and native compilers treat
 * it as a deferred dynamic load rather than a hard static dependency. A
 * `node:smol-*` binding is registered only by socket-btm's smol Node binary; on
 * stock Node it must not become a mandatory module. Callers gate this behind
 * `isNodeBuiltin(specifier)`, so the load runs only where the binding exists.
 *
 * Single source of truth for the smol-binding loaders' guarded
 * `node:smol-*` loads.
 *
 * Use this only for optional, feature-detected native builtins. A normal
 * dependency you want bundled must use a static `import`: a non-literal
 * specifier is invisible to bundlers, so they would exclude it from the output.
 */
export function requireBuiltin(specifier: string): unknown {
  if (!IS_NODE) {
    return undefined
  }
  return require(specifier)
}
