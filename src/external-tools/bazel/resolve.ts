/**
 * @fileoverview `resolveBazel()` — Bazel resolution entry point.
 *
 * Tries each source in order:
 *
 *   1. VFS  — smol binary's embedded Bazel (if packed)
 *   2. PATH — `bazelisk` (preferred) or `bazel` on the system PATH
 *
 * Returns `undefined` if neither source turned up Bazel. The caller
 * (socket-cli or another consumer) decides what to do then — usually
 * download Bazel into a managed cache and retry, or surface an
 * actionable error.
 *
 * Memoized per-process: the first call walks the chain; subsequent
 * calls return the cached promise.
 */

import { bazelFromPath } from './from-path'
import { bazelFromVfs } from './from-vfs'

import type { ResolvedBazel } from './types'

let _resolved: Promise<ResolvedBazel | undefined> | undefined

/* c8 ignore start - test-only escape hatch. */
export function _resetBazelResolution(): void {
  _resolved = undefined
}
/* c8 ignore stop */

export async function doResolveBazel(): Promise<ResolvedBazel | undefined> {
  const fromVfs = await bazelFromVfs()
  if (fromVfs) {
    return fromVfs
  }
  return bazelFromPath()
}

export function resolveBazel(): Promise<ResolvedBazel | undefined> {
  if (!_resolved) {
    _resolved = doResolveBazel()
  }
  return _resolved
}
