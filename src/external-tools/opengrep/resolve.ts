/**
 * @file `resolveOpengrep()` — OpenGrep resolution entry point. Tries each
 *   source in order:
 *
 *   1. VFS — smol binary's embedded OpenGrep (if packed)
 *   2. PATH — `opengrep` on the system PATH
 *   3. download — upstream GitHub release asset (only when `downloadIfMissing` is
 *      passed) Returns `undefined` if all of the enabled sources miss. Memoized
 *      per option-shape.
 */

import { opengrepFromDownload } from './from-download'
import { opengrepFromPath } from './from-path'
import { opengrepFromVfs } from './from-vfs'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { ResolvedOpengrep } from './types'

import { MapCtor } from '../../primordials/map-set'

export interface ResolveOpengrepOptions {
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
  Promise<ResolvedOpengrep | undefined>
>()

export function cacheKey(opts: ResolveOpengrepOptions | undefined): string {
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

export async function doResolveOpengrep(
  opts?: ResolveOpengrepOptions | undefined,
): Promise<ResolvedOpengrep | undefined> {
  const fromVfs = await opengrepFromVfs()
  /* c8 ignore start - smol Node binary only. */
  if (fromVfs) {
    return fromVfs
  }
  /* c8 ignore stop */
  const fromPath = await opengrepFromPath()
  if (fromPath) {
    return fromPath
  }
  if (opts?.downloadIfMissing) {
    return opengrepFromDownload(opts.downloadIfMissing)
  }
  return undefined
}

/* c8 ignore start - test-only escape hatch. */
export function resetOpengrepResolution(): void {
  resolutionCache.clear()
}
/* c8 ignore stop */

export function resolveOpengrep(
  opts?: ResolveOpengrepOptions | undefined,
): Promise<ResolvedOpengrep | undefined> {
  const key = cacheKey(opts)
  let cached = resolutionCache.get(key)
  if (!cached) {
    cached = doResolveOpengrep(opts)
    resolutionCache.set(key, cached)
  }
  return cached
}
