/**
 * @file `resolveSynp()` — synp resolution entry point. Tries each source in
 *   order:
 *
 *   1. VFS — the smol binary's embedded synp, when packed.
 *   2. PATH — `synp` on the system PATH
 *   3. download — pinned npm package via dlx (only when `downloadIfMissing` is
 *      passed) Returns `undefined` if all of the enabled sources miss. Memoized
 *      per option-shape.
 */

import { synpFromDownload } from './from-download.mjs'
import { synpFromPath } from './from-path.mjs'
import { synpFromVfs } from './from-vfs.mjs'

import type { ResolvedSynp } from './types.mjs'

import { MapCtor } from '../../primordials/map-set.mjs'

export interface ResolveSynpOptions {
  downloadIfMissing?:
    | {
        version: string
        integrity?: string | undefined
      }
    | undefined
}

const resolutionCache = new MapCtor<string, Promise<ResolvedSynp | undefined>>()

export function cacheKey(options: ResolveSynpOptions | undefined): string {
  options = { __proto__: null, ...options } as typeof options
  if (!options?.downloadIfMissing) {
    return 'local-only'
  }
  const { integrity, version } = options.downloadIfMissing
  return `dl:${version}:${integrity ?? ''}`
}

export async function doResolveSynp(
  options?: ResolveSynpOptions | undefined,
): Promise<ResolvedSynp | undefined> {
  options = { __proto__: null, ...options } as typeof options
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
  if (options?.downloadIfMissing) {
    return synpFromDownload(options.downloadIfMissing)
  }
  return undefined
}

/**
 * @unused No internal or Socket consumers; exercised only by its unit tests.
 */
/* c8 ignore start - test-only escape hatch. */
export function resetSynpResolution(): void {
  resolutionCache.clear()
}
/* c8 ignore stop */

export function resolveSynp(
  options?: ResolveSynpOptions | undefined,
): Promise<ResolvedSynp | undefined> {
  const key = cacheKey(options)
  let cached = resolutionCache.get(key)
  if (!cached) {
    cached = doResolveSynp(options)
    resolutionCache.set(key, cached)
  }
  return cached
}
