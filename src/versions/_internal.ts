/**
 * @fileoverview Private internals for `versions/*` modules — eagerly
 * picks the right implementation at module load. On socket-btm's smol
 * Node binary, prefers `node:smol-versions` (C++-accelerated via
 * `internalBinding('smol_versions_native')`); on stock Node, falls
 * through to the vendored JS `semver`. Both expose a strict-superset
 * surface for the ops `versions/*` calls, so leaves can forward to
 * `impl.<op>` directly without per-call branching.
 *
 * `getMajorVersion`-style helpers need the parsed object shape
 * (`{major, minor, patch}`) which only `semver.parse` exposes — those
 * leaves use `getSemver()` directly instead of going through `impl`.
 */

import { getSmolVersions } from '../smol/versions'

import type * as semverType from '../external/semver'
import type { SmolVersionsBinding } from '../smol/versions'

const _semver = require('../external/semver') as typeof semverType

/**
 * The vendored `semver` JS implementation. Always available — used
 * directly by the leaves that need the parsed `{major, minor, patch}`
 * shape (which smol-versions doesn't expose).
 */
export function getSemver(): typeof semverType {
  return _semver
}

/**
 * Resolved version implementation: smol-versions on the smol Node
 * binary, otherwise the vendored `semver`. Bound once at module load.
 */
export const impl: SmolVersionsBinding | typeof semverType =
  getSmolVersions() ?? _semver
