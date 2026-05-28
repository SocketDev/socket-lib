/**
 * @file `resolveTrufflehog()` — TruffleHog resolution entry point. Tries each
 *   source in order:
 *
 *   1. VFS — smol binary's embedded TruffleHog (if packed)
 *   2. PATH — `trufflehog` on the system PATH
 *   3. download — upstream GitHub release tar.gz (only when `downloadIfMissing` is
 *      passed) Returns `undefined` if all of the enabled sources miss. Memoized
 *      per option-shape; same caching semantics as `resolveJre()`.
 */

import { trufflehogFromDownload } from './from-download'
import { trufflehogFromPath } from './from-path'
import { trufflehogFromVfs } from './from-vfs'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { ResolvedTrufflehog } from './types'

import { MapCtor } from '../../primordials/map-set'

export interface ResolveTrufflehogOptions {
  /**
   * When set, the resolver falls through to a GitHub release download after the
   * local-discovery tiers miss. Omit to keep the resolver read-only.
   */
  downloadIfMissing?:
    | {
        version: string
        platformArch: string
        integrity?: HashSpec | undefined
        cacheDir?: string | undefined
        downloader?: BinaryDownloader | undefined
      }
    | undefined
}

const resolutionCache = new MapCtor<
  string,
  Promise<ResolvedTrufflehog | undefined>
>()

export function cacheKey(opts: ResolveTrufflehogOptions | undefined): string {
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

export async function doResolveTrufflehog(
  opts?: ResolveTrufflehogOptions | undefined,
): Promise<ResolvedTrufflehog | undefined> {
  const fromVfs = await trufflehogFromVfs()
  /* c8 ignore start - smol Node binary only. */
  if (fromVfs) {
    return fromVfs
  }
  /* c8 ignore stop */
  const fromPath = await trufflehogFromPath()
  if (fromPath) {
    return fromPath
  }
  if (opts?.downloadIfMissing) {
    return trufflehogFromDownload(opts.downloadIfMissing)
  }
  return undefined
}

/* c8 ignore start - test-only escape hatch. */
export function resetTrufflehogResolution(): void {
  resolutionCache.clear()
}
/* c8 ignore stop */

export function resolveTrufflehog(
  opts?: ResolveTrufflehogOptions | undefined,
): Promise<ResolvedTrufflehog | undefined> {
  const key = cacheKey(opts)
  let cached = resolutionCache.get(key)
  if (!cached) {
    cached = doResolveTrufflehog(opts)
    resolutionCache.set(key, cached)
  }
  return cached
}
