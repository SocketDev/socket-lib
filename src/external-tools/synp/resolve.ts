/**
 * @file `resolveSynp()` — synp resolution entry point. Tries each source in
 *   order:
 *
 *   1. VFS — smol binary's embedded synp (if packed)
 *   2. PATH — `synp` on the system PATH
 *   3. download — pinned npm package via dlx (only when `downloadIfMissing` is
 *      passed) Returns `undefined` if all of the enabled sources miss. Memoized
 *      per option-shape.
 */

import { synpFromDownload } from './from-download'
import { synpFromPath } from './from-path'
import { synpFromVfs } from './from-vfs'

import type { ResolvedSynp } from './types'

export interface ResolveSynpOptions {
  downloadIfMissing?:
    | {
        version: string
        integrity?: string | undefined
      }
    | undefined
}

const _resolutionCache = new Map<string, Promise<ResolvedSynp | undefined>>()

/* c8 ignore start - test-only escape hatch. */
export function _resetSynpResolution(): void {
  _resolutionCache.clear()
}
/* c8 ignore stop */

export function cacheKey(opts: ResolveSynpOptions | undefined): string {
  if (!opts?.downloadIfMissing) {
    return 'local-only'
  }
  const { integrity, version } = opts.downloadIfMissing
  return `dl:${version}:${integrity ?? ''}`
}

export async function doResolveSynp(
  opts?: ResolveSynpOptions | undefined,
): Promise<ResolvedSynp | undefined> {
  const fromVfs = await synpFromVfs()
  /* c8 ignore start - smol Node binary only. */
  if (fromVfs) {
    return fromVfs
  }
  /* c8 ignore stop */
  const fromPath = await synpFromPath()
  if (fromPath) {
    return fromPath
  }
  if (opts?.downloadIfMissing) {
    return synpFromDownload(opts.downloadIfMissing)
  }
  return undefined
}

export function resolveSynp(
  opts?: ResolveSynpOptions | undefined,
): Promise<ResolvedSynp | undefined> {
  const key = cacheKey(opts)
  let cached = _resolutionCache.get(key)
  if (!cached) {
    cached = doResolveSynp(opts)
    _resolutionCache.set(key, cached)
  }
  return cached
}
