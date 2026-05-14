/**
 * @fileoverview `resolveSbt()` — SBT resolution entry point.
 *
 * Tries each source in order:
 *
 *   1. VFS  — smol binary's embedded `sbt-launch.jar` (if packed)
 *   2. PATH — `sbt` script on the system PATH
 *
 * VFS-sourced SBT is a `.jar` that must be invoked as
 * `java -jar <path>` using the JRE resolved separately via
 * `resolveJre()`. PATH-sourced SBT is the user's own `sbt` script,
 * which finds its own JRE.
 *
 * Returns `undefined` if neither source turned up SBT. The caller
 * decides whether to download or surface an error.
 *
 * Memoized per-process.
 */

import { sbtFromPath } from './from-path'
import { sbtFromVfs } from './from-vfs'

import type { ResolvedSbt } from './types'

let _resolved: Promise<ResolvedSbt | undefined> | undefined

/* c8 ignore start - test-only escape hatch. */
export function _resetSbtResolution(): void {
  _resolved = undefined
}
/* c8 ignore stop */

export async function doResolveSbt(): Promise<ResolvedSbt | undefined> {
  const fromVfs = await sbtFromVfs()
  /* c8 ignore start - smol Node binary only. */
  if (fromVfs) {
    return fromVfs
  }
  /* c8 ignore stop */
  return sbtFromPath()
}

export function resolveSbt(): Promise<ResolvedSbt | undefined> {
  if (!_resolved) {
    _resolved = doResolveSbt()
  }
  return _resolved
}
