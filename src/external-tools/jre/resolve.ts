/**
 * @fileoverview `resolveJre()` — the JRE resolution entry point.
 *
 * Tries each source in order:
 *
 *   1. VFS  — smol binary's embedded JRE (zero network, fast)
 *   2. JAVA_HOME — user-pinned via env var
 *   3. PATH — `java` (or `java.exe`) on the system PATH
 *
 * Returns `undefined` if none of the sources turned up a JRE. The
 * caller (socket-cli or another consumer) decides what to do then
 * — typically download into a managed cache and retry, or fail with
 * an actionable error.
 *
 * Memoized: the first call walks the chain; subsequent calls return
 * the cached promise. Cache is per-process; the resolver assumes a
 * JRE won't appear/disappear at runtime (which is true in practice
 * for every reasonable deployment).
 *
 * Test-only escape hatch: `_resetJreResolution()` clears the cache
 * so tests can exercise the resolver fresh without spawning new
 * processes.
 */

import { jreFromJavaHome } from './from-java-home'
import { jreFromPath } from './from-path'
import { jreFromVfs } from './from-vfs'

import type { ResolvedJre } from './types'

let _resolved: Promise<ResolvedJre | undefined> | undefined

/* c8 ignore start - test-only escape hatch. */
export function _resetJreResolution(): void {
  _resolved = undefined
}
/* c8 ignore stop */

export async function doResolveJre(): Promise<ResolvedJre | undefined> {
  const fromVfs = await jreFromVfs()
  /* c8 ignore start - smol Node binary only. */
  if (fromVfs) {
    return fromVfs
  }
  /* c8 ignore stop */
  const fromJavaHome = jreFromJavaHome()
  if (fromJavaHome) {
    return fromJavaHome
  }
  return jreFromPath()
}

export function resolveJre(): Promise<ResolvedJre | undefined> {
  if (!_resolved) {
    _resolved = doResolveJre()
  }
  return _resolved
}
