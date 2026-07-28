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

import { MapCtor } from '../../primordials/map-set'

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

const resolutionCache = new MapCtor<string, Promise<ResolvedJre | undefined>>()

export function cacheKey(options: ResolveJreOptions | undefined): string {
  options = { __proto__: null, ...options } as typeof options
  if (!options?.downloadIfMissing) {
    return 'local-only'
  }
  const { cacheDir, integrity, platformArch, version } =
    options.downloadIfMissing
  const integrityKey =
    typeof integrity === 'string'
      ? integrity
      : integrity
        ? `${integrity.type}:${integrity.value}`
        : ''
  return `dl:${version}:${platformArch}:${integrityKey}:${cacheDir ?? ''}`
}

export async function doResolveJre(
  options?: ResolveJreOptions | undefined,
): Promise<ResolvedJre | undefined> {
  options = { __proto__: null, ...options } as typeof options
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
  if (options?.downloadIfMissing) {
    return jreFromDownload(options.downloadIfMissing)
  }
  return undefined
}

/* c8 ignore start - test-only escape hatch. */
export function resetJreResolution(): void {
  resolutionCache.clear()
}
/* c8 ignore stop */

export function resolveJre(
  options?: ResolveJreOptions | undefined,
): Promise<ResolvedJre | undefined> {
  const key = cacheKey(options)
  let cached = resolutionCache.get(key)
  if (!cached) {
    cached = doResolveJre(options)
    resolutionCache.set(key, cached)
  }
  return cached
}
