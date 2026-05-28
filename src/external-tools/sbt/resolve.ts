/**
 * @file `resolveSbt()` — SBT resolution entry point. Tries each source in
 *   order:
 *
 *   1. VFS — smol binary's embedded `sbt-launch.jar` (if packed)
 *   2. PATH — `sbt` script on the system PATH
 *   3. download — upstream GitHub release tgz (only when `downloadIfMissing` is
 *      passed) VFS-sourced SBT is a `.jar` that must be invoked as `java -jar
 *      <path>` using the JRE resolved separately via `resolveJre()`. PATH- and
 *      download-sourced SBT is the `sbt` script, which finds its own JRE.
 *      Memoized per option-shape.
 */

import { sbtFromDownload } from './from-download'
import { sbtFromPath } from './from-path'
import { sbtFromVfs } from './from-vfs'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { ResolvedSbt } from './types'

import { MapCtor } from '../../primordials/map-set'

export interface ResolveSbtOptions {
  /**
   * When set, the resolver falls through to a GitHub release download after the
   * local-discovery tiers miss. Omit to keep the resolver read-only.
   */
  downloadIfMissing?:
    | {
        version: string
        integrity?: HashSpec | undefined
        cacheDir?: string | undefined
        downloader?: BinaryDownloader | undefined
      }
    | undefined
}

const resolutionCache = new MapCtor<string, Promise<ResolvedSbt | undefined>>()

export function cacheKey(opts: ResolveSbtOptions | undefined): string {
  if (!opts?.downloadIfMissing) {
    return 'local-only'
  }
  const { cacheDir, integrity, version } = opts.downloadIfMissing
  const integrityKey =
    typeof integrity === 'string'
      ? integrity
      : integrity
        ? `${integrity.type}:${integrity.value}`
        : ''
  return `dl:${version}:${integrityKey}:${cacheDir ?? ''}`
}

export async function doResolveSbt(
  opts?: ResolveSbtOptions | undefined,
): Promise<ResolvedSbt | undefined> {
  const fromVfs = await sbtFromVfs()
  /* c8 ignore start - smol Node binary only. */
  if (fromVfs) {
    return fromVfs
  }
  /* c8 ignore stop */
  const fromPath = await sbtFromPath()
  if (fromPath) {
    return fromPath
  }
  if (opts?.downloadIfMissing) {
    return sbtFromDownload(opts.downloadIfMissing)
  }
  return undefined
}

/* c8 ignore start - test-only escape hatch. */
export function resetSbtResolution(): void {
  resolutionCache.clear()
}
/* c8 ignore stop */

export function resolveSbt(
  opts?: ResolveSbtOptions | undefined,
): Promise<ResolvedSbt | undefined> {
  const key = cacheKey(opts)
  let cached = resolutionCache.get(key)
  if (!cached) {
    cached = doResolveSbt(opts)
    resolutionCache.set(key, cached)
  }
  return cached
}
