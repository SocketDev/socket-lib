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

export function cacheKey(options: ResolveOpengrepOptions | undefined): string {
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

export async function doResolveOpengrep(
  options?: ResolveOpengrepOptions | undefined,
): Promise<ResolvedOpengrep | undefined> {
  options = { __proto__: null, ...options } as typeof options
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
  if (options?.downloadIfMissing) {
    return opengrepFromDownload(options.downloadIfMissing)
  }
  return undefined
}

/* c8 ignore start - test-only escape hatch. */
export function resetOpengrepResolution(): void {
  resolutionCache.clear()
}
/* c8 ignore stop */

export function resolveOpengrep(
  options?: ResolveOpengrepOptions | undefined,
): Promise<ResolvedOpengrep | undefined> {
  const key = cacheKey(options)
  let cached = resolutionCache.get(key)
  if (!cached) {
    cached = doResolveOpengrep(options)
    resolutionCache.set(key, cached)
  }
  return cached
}
