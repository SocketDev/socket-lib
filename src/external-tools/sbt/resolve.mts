/**
 * @file `resolveSbt()` — SBT resolution entry point. Tries each source in
 *   order:
 *
 *   1. VFS — smol binary's embedded `sbt-launch.jar`, when packed
 *   2. PATH — `sbt` script on the system PATH
 *   3. download — upstream GitHub release tgz (only when `downloadIfMissing` is
 *      passed) VFS-sourced SBT is a `.jar` that must be invoked as `java -jar
 *      <path>` using the JRE resolved separately via `resolveJre()`. PATH- and
 *      download-sourced SBT is the `sbt` script, which finds its own JRE.
 *      Memoized per option-shape.
 */

import { sbtFromDownload } from './from-download.mjs'
import { sbtFromPath } from './from-path.mjs'
import { sbtFromVfs } from './from-vfs.mjs'

import type { BinaryDownloader } from '../from-download.mjs'
import type { HashInput } from '../../crypto/integrity.mjs'
import type { ResolvedSbt } from './types.mjs'

import { MapCtor } from '../../primordials/map-set.mjs'

export interface ResolveSbtOptions {
  /**
   * When set, the resolver falls through to a GitHub release download after the
   * local-discovery tiers miss. Omit to keep the resolver read-only.
   */
  downloadIfMissing?:
    | {
        version: string
        integrity?: HashInput | undefined
        cacheDir?: string | undefined
        downloader?: BinaryDownloader | undefined
      }
    | undefined
}

const resolutionCache = new MapCtor<string, Promise<ResolvedSbt | undefined>>()

export function cacheKey(options: ResolveSbtOptions | undefined): string {
  options = { __proto__: null, ...options } as typeof options
  if (!options?.downloadIfMissing) {
    return 'local-only'
  }
  const { cacheDir, integrity, version } = options.downloadIfMissing
  const integrityKey =
    typeof integrity === 'string' ? integrity : integrity ? integrity.sri : ''
  return `dl:${version}:${integrityKey}:${cacheDir ?? ''}`
}

export async function doResolveSbt(
  options?: ResolveSbtOptions | undefined,
): Promise<ResolvedSbt | undefined> {
  options = { __proto__: null, ...options } as typeof options
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
  if (options?.downloadIfMissing) {
    return sbtFromDownload(options.downloadIfMissing)
  }
  return undefined
}

/**
 * @unused No internal or Socket consumers — exercised only by its unit tests.
 */
/* c8 ignore start - test-only escape hatch. */
export function resetSbtResolution(): void {
  resolutionCache.clear()
}
/* c8 ignore stop */

export function resolveSbt(
  options?: ResolveSbtOptions | undefined,
): Promise<ResolvedSbt | undefined> {
  const key = cacheKey(options)
  let cached = resolutionCache.get(key)
  if (!cached) {
    cached = doResolveSbt(options)
    resolutionCache.set(key, cached)
  }
  return cached
}
