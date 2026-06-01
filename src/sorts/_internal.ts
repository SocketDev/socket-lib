/**
 * @file Private internals for `sorts/*` modules — lazy module accessors for
 *   fast-sort + semver, and the cached Intl.Collator instances. Used by the
 *   locale / natural / semver comparison entrypoints.
 */

import type * as fastSortType from '../external/fast-sort'
import type * as semverType from '../external/semver'

let fastSort: typeof fastSortType | undefined
let semver: typeof semverType | undefined

export function getFastSort() {
  if (fastSort === undefined) {
    fastSort = /*@__PURE__*/ require('../external/fast-sort.js')
  }
  return fastSort!
}

export function getSemver() {
  if (semver === undefined) {
    semver = /*@__PURE__*/ require('../external/semver.js')
  }
  return semver!
}
