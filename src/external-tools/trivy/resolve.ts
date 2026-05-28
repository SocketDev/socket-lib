/**
 * @file `resolveTrivy()` — Trivy resolution entry point. Tries each source in
 *   order:
 *
 *   1. VFS — smol binary's embedded Trivy (if packed)
 *   2. PATH — `trivy` on the system PATH
 *   3. download — upstream GitHub release archive (only when `downloadIfMissing`
 *      is passed) Returns `undefined` if all of the enabled sources miss.
 *      Memoized per option-shape.
 */

import { trivyFromDownload } from './from-download'
import { trivyFromPath } from './from-path'
import { trivyFromVfs } from './from-vfs'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { ResolvedTrivy } from './types'

import { MapCtor } from '../../primordials/map-set'

export interface ResolveTrivyOptions {
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
  Promise<ResolvedTrivy | undefined>
>()

export function cacheKey(opts: ResolveTrivyOptions | undefined): string {
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

export async function doResolveTrivy(
  opts?: ResolveTrivyOptions | undefined,
): Promise<ResolvedTrivy | undefined> {
  const fromVfs = await trivyFromVfs()
  /* c8 ignore start - smol Node binary only. */
  if (fromVfs) {
    return fromVfs
  }
  /* c8 ignore stop */
  const fromPath = await trivyFromPath()
  if (fromPath) {
    return fromPath
  }
  if (opts?.downloadIfMissing) {
    return trivyFromDownload(opts.downloadIfMissing)
  }
  return undefined
}

/* c8 ignore start - test-only escape hatch. */
export function resetTrivyResolution(): void {
  resolutionCache.clear()
}
/* c8 ignore stop */

export function resolveTrivy(
  opts?: ResolveTrivyOptions | undefined,
): Promise<ResolvedTrivy | undefined> {
  const key = cacheKey(opts)
  let cached = resolutionCache.get(key)
  if (!cached) {
    cached = doResolveTrivy(opts)
    resolutionCache.set(key, cached)
  }
  return cached
}
