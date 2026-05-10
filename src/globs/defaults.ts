/**
 * @fileoverview Public re-export of `defaultIgnore` — the npm-packlist-
 * derived ignore list used as a starting point for caller-customized
 * ignore arrays. The frozen list itself lives in `_internals.ts`
 * because matcher / stream code uses it directly; we re-export the
 * canonical reference so external callers don't have to dig into the
 * private leaf.
 */

export { defaultIgnore } from './_internals'
