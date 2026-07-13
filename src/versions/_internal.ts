/**
 * @file Private internals for `versions/*` modules — lazily picks the right
 *   implementation at FIRST USE. On socket-btm's smol Node binary, prefers
 *   `node:smol-versions` (C++-accelerated via
 *   `internalBinding('smol_versions_native')`); on stock Node, falls through to
 *   the vendored JS `semver`. Both expose a strict-superset surface for the ops
 *   `versions/*` calls, so leaves can forward to `getImpl().<op>` directly
 *   without per-call branching. `getMajorVersion`-style helpers need the parsed
 *   object shape (`{major, minor, patch}`) which only `semver.parse` exposes —
 *   those leaves use `getSemver()` directly instead of going through the impl.
 *   Snapshot safety: the vendored `semver` resolves through the npm-pack
 *   bundle, whose module-eval constructs a live native `[Foreign]` handle
 *   (cacache/pacote/make-fetch-happen). Requiring it at module load pins that
 *   handle and aborts `node --build-snapshot`. So both the `require` and the
 *   smol-vs-semver pick are deferred to first call and memoized.
 */

import { getSmolVersions } from '../smol/versions'

import type {
  coerce,
  compare,
  diff,
  eq,
  gt,
  gte,
  inc,
  lt,
  lte,
  maxSatisfying,
  minSatisfying,
  parse,
  rsort,
  satisfies,
  sort,
  valid,
} from '../external/semver'
import type { SmolVersionsBinding } from '../smol/versions'

/**
 * The surface of the vendored `semver` module the `versions/*` leaves call.
 * Built from named imports (vs. `import * as`) so the used surface stays
 * explicit and greppable.
 */
export interface Semver {
  coerce: typeof coerce
  compare: typeof compare
  diff: typeof diff
  eq: typeof eq
  gt: typeof gt
  gte: typeof gte
  inc: typeof inc
  lt: typeof lt
  lte: typeof lte
  maxSatisfying: typeof maxSatisfying
  minSatisfying: typeof minSatisfying
  parse: typeof parse
  rsort: typeof rsort
  satisfies: typeof satisfies
  sort: typeof sort
  valid: typeof valid
}

let impl: SmolVersionsBinding | Semver | undefined

/**
 * Resolved version implementation: smol-versions on the smol Node binary,
 * otherwise the vendored `semver`. Resolved once on first call and memoized —
 * deferred from module load so importing a `versions/*` leaf is handle-free.
 */
export function getImpl(): SmolVersionsBinding | Semver {
  if (impl === undefined) {
    impl = getSmolVersions() ?? getSemver()
  }
  return impl
}

let semver: Semver | undefined

/**
 * The vendored `semver` JS implementation. Always available — used directly by
 * the leaves that need the parsed `{major, minor, patch}` shape (which
 * smol-versions doesn't expose). Required lazily on first call so importing a
 * `versions/*` leaf does not pull in the native-handle-bearing npm-pack bundle.
 */
export function getSemver(): Semver {
  if (semver === undefined) {
    semver = require('../external/semver') as Semver
  }
  return semver
}
