/**
 * @file `resolveJre()` — the JRE resolution entry point. Tries each source in
 *   order:
 *
 *   1. VFS — smol binary's embedded JRE (zero network, fast)
 *   2. JAVA_HOME — user-pinned via env var
 *   3. PATH — `java` (or `java.exe`) on the system PATH
 *   4. download — Adoptium fetch + extract (only when `downloadIfMissing` is
 *      passed) Returns `undefined` if all of the enabled sources miss. The
 *      caller decides what to do then — typically prompt the user, surface an
 *      install instruction, or fail with an actionable error. Memoized per
 *      option-shape: calls with identical options return the same cached
 *      promise. Calling without `downloadIfMissing` and then with
 *      `downloadIfMissing` produces two distinct cache entries so the second
 *      call can fall through to the download tier even after the first call's
 *      "all local tiers missed → undefined" memoized. Test-only escape hatch:
 *      `resetJreResolution()` clears the cache so tests can exercise the
 *      resolver fresh.
 */

import { jreFromDownload } from './from-download'
import { jreFromJavaHome } from './from-java-home'
import { jreFromPath } from './from-path'
import { jreFromVfs } from './from-vfs'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { ResolvedJre } from './types'

export interface ResolveJreOptions {
  /**
   * When set, the resolver falls through to an Adoptium download after the
   * local-discovery tiers miss. Omit to keep the resolver read-only (no
   * network).
   */
  downloadIfMissing?:
    | {
        version: number
        platformArch: string
        integrity?: HashSpec | undefined
        cacheDir?: string | undefined
        downloader?: BinaryDownloader | undefined
      }
    | undefined
}

const resolutionCache = new Map<string, Promise<ResolvedJre | undefined>>()

export function cacheKey(opts: ResolveJreOptions | undefined): string {
  if (!opts?.downloadIfMissing) {
    return 'local-only'
  }
  const { cacheDir, integrity, platformArch, version } = opts.downloadIfMissing
  const integrityKey =
    typeof integrity === 'string'
      ? integrity
      : integrity
        ? `${integrity.type}:${integrity.value}`
        : ''
  return `dl:${version}:${platformArch}:${integrityKey}:${cacheDir ?? ''}`
}

export async function doResolveJre(
  opts?: ResolveJreOptions | undefined,
): Promise<ResolvedJre | undefined> {
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
  const fromPath = await jreFromPath()
  if (fromPath) {
    return fromPath
  }
  if (opts?.downloadIfMissing) {
    return jreFromDownload(opts.downloadIfMissing)
  }
  return undefined
}

/* c8 ignore start - test-only escape hatch. */
export function resetJreResolution(): void {
  resolutionCache.clear()
}
/* c8 ignore stop */

export function resolveJre(
  opts?: ResolveJreOptions | undefined,
): Promise<ResolvedJre | undefined> {
  const key = cacheKey(opts)
  let cached = resolutionCache.get(key)
  if (!cached) {
    cached = doResolveJre(opts)
    resolutionCache.set(key, cached)
  }
  return cached
}
