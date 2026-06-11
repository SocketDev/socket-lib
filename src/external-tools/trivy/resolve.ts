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

export function cacheKey(options: ResolveTrivyOptions | undefined): string {
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

export async function doResolveTrivy(
  options?: ResolveTrivyOptions | undefined,
): Promise<ResolvedTrivy | undefined> {
  options = { __proto__: null, ...options } as typeof options
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
  if (options?.downloadIfMissing) {
    return trivyFromDownload(options.downloadIfMissing)
  }
  return undefined
}

/* c8 ignore start - test-only escape hatch. */
export function resetTrivyResolution(): void {
  resolutionCache.clear()
}
/* c8 ignore stop */

export function resolveTrivy(
  options?: ResolveTrivyOptions | undefined,
): Promise<ResolvedTrivy | undefined> {
  const key = cacheKey(options)
  let cached = resolutionCache.get(key)
  if (!cached) {
    cached = doResolveTrivy(options)
    resolutionCache.set(key, cached)
  }
  return cached
}
