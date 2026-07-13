/**
 * @file Private internals for `bin/*` modules — lazy `fs` / `path` accessors
 *   and the binary-resolution caches. Underscore prefix keeps this file out of
 *   the public exports map (see the `dist/<dir>/_<file>` ignore in
 *   scripts/fleet/make-package-exports.mts). Two caches:
 *
 *   1. `binPathCache` — maps a binary name to its first resolved path. Validated
 *      with `existsSync` before reuse so a stale cache doesn't survive a tool
 *      reinstall mid-session.
 *   2. `binPathAllCache` — same shape but stores all-match arrays for callers that
 *      pass `{ all: true }`. Separate cache because the two return shapes can't
 *      be reconciled without losing type info.
 *   3. `voltaBinCache` — maps a `${voltaPath}:${basename}` composite key to the
 *      resolved Volta-managed binary path. Volta resolves npm / pnpm / yarn
 *      through a layered tools/image directory and the lookup is expensive
 *      enough that caching is worth the memory.
 */

import { MapCtor } from '../primordials/map-set'
export const binPathCache = new MapCtor<string, string>()

export const binPathAllCache = new MapCtor<string, string[]>()

export const voltaBinCache = new MapCtor<string, string>()

// Re-export canonical node:fs / node:path loaders under the bin/ legacy
// names for siblings (which, find, exec, …). New code should import
// getNodeFs / getNodePath from '@socketsecurity/lib/node/{fs,path}'.
export { getNodeFs as getFs } from '../node/fs'
export { getNodePath as getPath } from '../node/path'
