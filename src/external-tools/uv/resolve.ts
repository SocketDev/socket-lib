/**
 * @file `resolveUv()` — uv resolution entry point. Tries each source in order:
 *
 *   1. VFS — smol binary's embedded uv (if packed)
 *   2. PATH — `uv` on the system PATH
 *   3. download — upstream GitHub release archive (only when `downloadIfMissing`
 *      is passed) Returns `undefined` if all of the enabled sources miss.
 *      Memoized per option-shape.
 */

import { uvFromDownload } from './from-download'
import { uvFromPath } from './from-path'
import { uvFromVfs } from './from-vfs'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { ResolvedUv } from './types'

export interface ResolveUvOptions {
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

const resolutionCache = new Map<string, Promise<ResolvedUv | undefined>>()

/* c8 ignore start - test-only escape hatch. */
export function resetUvResolution(): void {
  resolutionCache.clear()
}
/* c8 ignore stop */

export function cacheKey(opts: ResolveUvOptions | undefined): string {
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

export async function doResolveUv(
  opts?: ResolveUvOptions | undefined,
): Promise<ResolvedUv | undefined> {
  const fromVfs = await uvFromVfs()
  /* c8 ignore start - smol Node binary only. */
  if (fromVfs) {
    return fromVfs
  }
  /* c8 ignore stop */
  const fromPath = await uvFromPath()
  if (fromPath) {
    return fromPath
  }
  if (opts?.downloadIfMissing) {
    return uvFromDownload(opts.downloadIfMissing)
  }
  return undefined
}

export function resolveUv(
  opts?: ResolveUvOptions | undefined,
): Promise<ResolvedUv | undefined> {
  const key = cacheKey(opts)
  let cached = resolutionCache.get(key)
  if (!cached) {
    cached = doResolveUv(opts)
    resolutionCache.set(key, cached)
  }
  return cached
}
