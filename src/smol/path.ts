/**
 * @file Lazy-loader for socket-btm's `node:smol-path` — native fast paths for
 *   the hot path-string primitives (`dirname`, `normalize`, …) and, per the
 *   socket-btm `node-smol-path` Phase 4 plan, batched filesystem ops (`access`,
 *   an in-C++ `findUp`). Returns `undefined` on stock Node, non-Node runtimes,
 *   and on socket-btm binaries that haven't shipped the binding yet; callers
 *   fall back to the JS implementation. Result is cached. The binding does not
 *   exist yet (the plan is unbuilt) — this accessor is the seam so that when it
 *   lands, only this file changes and `paths/walk`, `fs/access`, `fs/find`
 *   light up natively. Today `getSmolPath()` is always `undefined` and the JS
 *   paths run.
 */

import { isNodeBuiltin } from '../node/module'

import type { PathLike } from 'node:fs'

/**
 * Native path / filesystem fast-path surface. Only the operations socket-lib's
 * helpers shim are typed; the binding may expose more. Every method is optional
 * so a partial rollout (e.g. `dirname` ships before `access`) still type-checks
 * at the shim sites.
 */
export interface SmolPathBinding {
  /**
   * `path.dirname` over the one-byte Fast API. ASCII fast path; two-byte inputs
   * route to the equivalent of `path.dirname`.
   */
  dirname?: ((p: string) => string) | undefined
  /**
   * `path.normalize` over the one-byte Fast API.
   */
  normalize?: ((p: string) => string) | undefined
  /**
   * `fs.accessSync`-equivalent returning a boolean instead of throwing — skips
   * the V8 error-object materialization the JS wrapper pays on every negative
   * check. `mode` is an `fs.constants` bit.
   */
  access?: ((path: PathLike, mode?: number | undefined) => boolean) | undefined
  /**
   * In-C++ find-up: walk `startDir`'s ancestors, return the first dir
   * containing any of `names` (as a file unless `onlyDirectories`), or
   * `undefined`. Collapses the N JS↔native crossings of the JS walk into one.
   */
  findUp?:
    | ((
        startDir: string,
        names: readonly string[],
        options?: { onlyDirectories?: boolean | undefined } | undefined,
      ) => string | undefined)
    | undefined
}

let smolPathCache: SmolPathBinding | undefined
let smolPathProbed = false

/**
 * Returns the `node:smol-path` binding when running on a smol Node binary that
 * ships it; otherwise `undefined`. Cached across calls.
 *
 * @returns The native binding, or `undefined` to signal "use the JS fallback".
 */
export function getSmolPath(): SmolPathBinding | undefined {
  if (!smolPathProbed) {
    smolPathProbed = true
    /* c8 ignore start - smol Node binary only. */
    if (isNodeBuiltin('node:smol-path')) {
      smolPathCache = require('node:smol-path') as SmolPathBinding
    }
    /* c8 ignore stop */
  }
  return smolPathCache
}
