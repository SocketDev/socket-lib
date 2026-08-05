/**
 * @file Private internals for `sorts/*` modules — lazy module accessors for
 *   fast-sort + semver, and the cached Intl.Collator instances. Used by the
 *   locale / natural / semver comparison entrypoints.
 */

import type { default as FastSort } from '../external/fast-sort'

let fastSort: typeof FastSort | undefined

export function getFastSort() {
  if (fastSort === undefined) {
    fastSort = /*@__PURE__*/ require('../external/fast-sort.js')
  }
  return fastSort!
}
