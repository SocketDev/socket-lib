/**
 * @fileoverview Private internals for `versions/*` modules — picks
 * the right implementation for each operation. On socket-btm's smol
 * Node binary, prefers `node:smol-versions` (C++-accelerated via
 * `internalBinding('smol_versions_native')`); on stock Node, falls
 * through to the vendored JS `semver`. Both expose a strict-superset
 * surface for the ops `versions/*` calls, so each leaf can swap the
 * impl at call time without hand-rolling a fallback.
 *
 * `getMajorVersion`-style helpers need the parsed object shape
 * (`{major, minor, patch}`), which only `semver.parse` exposes — so
 * those leaves call `getSemver()` directly instead of going through
 * `getVersionsImpl()`.
 */

import { getSmolVersions } from '../smol/versions'

import type * as semverType from '../external/semver'
import type { SmolVersionsBinding } from '../smol/versions'

const _smolVersions = getSmolVersions()

let _semver: typeof semverType | undefined

export function getSemver() {
  if (_semver === undefined) {
    _semver = require('../external/semver')
  }
  return _semver!
}

// Pick the impl for ops that exist on both. The cast is safe because
// the smol-versions binding is a strict superset of the methods we
// touch here, with identical semantics for npm.
export function getVersionsImpl(): SmolVersionsBinding | typeof semverType {
  return _smolVersions ?? getSemver()
}
