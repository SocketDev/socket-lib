/**
 * @fileoverview Re-export shim for the build-time primordials catalog.
 *
 * The split into `primordials/{array,object,string,...}` leaves is the
 * canonical organization — runtime consumers import directly from the
 * appropriate leaf. This file exists *only* so that
 * `scripts/build-externals/transform-primordials.mts`'s
 * `loadPrimordialsSurface` helper can read a single file to enumerate
 * the full primordials surface for its codemod pass over external
 * bundles.
 *
 * Do not import from this file in application code — use the leaves
 * (`./primordials/<concern>`) so tree-shaking can drop unused
 * categories.
 */

export * from './primordials/array'
export * from './primordials/buffer'
export * from './primordials/date'
export * from './primordials/error'
export * from './primordials/function'
export * from './primordials/globals'
export * from './primordials/json'
export * from './primordials/map-set'
export * from './primordials/math'
export * from './primordials/number'
export * from './primordials/object'
export * from './primordials/promise'
export * from './primordials/reflect'
export * from './primordials/regexp'
export * from './primordials/string'
export * from './primordials/symbol'
export * from './primordials/uncurry'
export * from './primordials/url'
