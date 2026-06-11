/**
 * @file `resolveJanus()` — janus resolution entry point. Tries each source in
 *   order:
 *
 *   1. VFS — smol binary's embedded janus (if packed)
 *   2. PATH — `janus` on the system PATH
 *   3. download — upstream GitHub release tar.gz (only when `downloadIfMissing` is
 *      passed) Returns `undefined` if all of the enabled sources miss —
 *      including when `downloadIfMissing` is set but the requested
 *      platform-arch isn't shipped by upstream janus (currently darwin-arm64
 *      only). Memoized per option-shape.
 */

import { janusFromDownload } from './from-download'
import { janusFromPath } from './from-path'
import { janusFromVfs } from './from-vfs'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { ResolvedJanus } from './types'

import { MapCtor } from '../../primordials/map-set'

export interface ResolveJanusOptions {
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
  Promise<ResolvedJanus | undefined>
>()

export function cacheKey(options: ResolveJanusOptions | undefined): string {
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

export async function doResolveJanus(
  options?: ResolveJanusOptions | undefined,
): Promise<ResolvedJanus | undefined> {
  options = { __proto__: null, ...options } as typeof options
  const fromVfs = await janusFromVfs()
  /* c8 ignore start - smol Node binary only. */
  if (fromVfs) {
    return fromVfs
  }
  /* c8 ignore stop */
  const fromPath = await janusFromPath()
  if (fromPath) {
    return fromPath
  }
  if (options?.downloadIfMissing) {
    return janusFromDownload(options.downloadIfMissing)
  }
  return undefined
}

/* c8 ignore start - test-only escape hatch. */
export function resetJanusResolution(): void {
  resolutionCache.clear()
}
/* c8 ignore stop */

export function resolveJanus(
  options?: ResolveJanusOptions | undefined,
): Promise<ResolvedJanus | undefined> {
  const key = cacheKey(options)
  let cached = resolutionCache.get(key)
  if (!cached) {
    cached = doResolveJanus(options)
    resolutionCache.set(key, cached)
  }
  return cached
}
