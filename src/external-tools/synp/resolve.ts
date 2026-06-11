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

import { MapCtor } from '../../primordials/map-set'

export interface ResolveSynpOptions {
  downloadIfMissing?:
    | {
        version: string
        integrity?: string | undefined
      }
    | undefined
}

const resolutionCache = new MapCtor<string, Promise<ResolvedSynp | undefined>>()

export function cacheKey(opts: ResolveSynpOptions | undefined): string {
  opts = { __proto__: null, ...opts } as typeof opts
  if (!opts?.downloadIfMissing) {
    return 'local-only'
  }
  const { integrity, version } = opts.downloadIfMissing
  return `dl:${version}:${integrity ?? ''}`
}

export async function doResolveSynp(
  opts?: ResolveSynpOptions | undefined,
): Promise<ResolvedSynp | undefined> {
  opts = { __proto__: null, ...opts } as typeof opts
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

/* c8 ignore start - test-only escape hatch. */
export function resetSynpResolution(): void {
  resolutionCache.clear()
}
/* c8 ignore stop */

export function resolveSynp(
  opts?: ResolveSynpOptions | undefined,
): Promise<ResolvedSynp | undefined> {
  const key = cacheKey(opts)
  let cached = resolutionCache.get(key)
  if (!cached) {
    cached = doResolveSynp(opts)
    resolutionCache.set(key, cached)
  }
  return cached
}
