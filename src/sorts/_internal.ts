/**
 * @file Private internals for `sorts/*` modules — lazy module accessors for
 *   fast-sort + semver, and the cached Intl.Collator instances. Used by the
 *   locale / natural / semver comparison entrypoints.
 */

import type * as fastSortType from '../external/fast-sort'

// `getSemver` is re-exported from `versions/_internal` — the single owner of
// the vendored-semver accessor, where the smol-versions fallback alignment
// lives. `sorts/semver` needs only `.compare`, which that accessor provides.
// Don't add a second vendored-semver require here.
export { getSemver } from '../versions/_internal'

let fastSort: typeof fastSortType | undefined

export function getFastSort() {
  if (fastSort === undefined) {
    fastSort = /*@__PURE__*/ require('../external/fast-sort.js')
  }
  return fastSort!
}
