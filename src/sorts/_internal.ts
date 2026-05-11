/**
 * @fileoverview Private internals for `sorts/*` modules — lazy
 * module accessors for fast-sort + semver, and the cached
 * Intl.Collator instances. Used by the locale / natural / semver
 * comparison entrypoints.
 */

import type * as fastSortType from '../external/fast-sort'
import type * as semverType from '../external/semver'

let _fastSort: typeof fastSortType | undefined
let _semver: typeof semverType | undefined

/*@__NO_SIDE_EFFECTS__*/
export function getFastSort() {
  if (_fastSort === undefined) {
    _fastSort = /*@__PURE__*/ require('../external/fast-sort.js')
  }
  return _fastSort!
}

/*@__NO_SIDE_EFFECTS__*/
export function getSemver() {
  if (_semver === undefined) {
    _semver = /*@__PURE__*/ require('../external/semver.js')
  }
  return _semver!
}
