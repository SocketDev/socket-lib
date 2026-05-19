/**
 * @file `resolveCdxgen()` — cdxgen resolution entry point. Tries each source in
 *   order:
 *
 *   1. VFS — smol binary's embedded cdxgen (if packed)
 *   2. PATH — `cdxgen` on the system PATH
 *   3. download — pinned npm package via dlx (only when `downloadIfMissing` is
 *      passed) Returns `undefined` if all of the enabled sources miss. Memoized
 *      per option-shape — same caching semantics as `resolveJre()`.
 */

import { cdxgenFromDownload } from './from-download'
import { cdxgenFromPath } from './from-path'
import { cdxgenFromVfs } from './from-vfs'

import type { ResolvedCdxgen } from './types'

export interface ResolveCdxgenOptions {
  downloadIfMissing?:
    | {
        version: string
        integrity?: string | undefined
      }
    | undefined
}

const _resolutionCache = new Map<string, Promise<ResolvedCdxgen | undefined>>()

/* c8 ignore start - test-only escape hatch. */
export function _resetCdxgenResolution(): void {
  _resolutionCache.clear()
}
/* c8 ignore stop */

export function cacheKey(opts: ResolveCdxgenOptions | undefined): string {
  if (!opts?.downloadIfMissing) {
    return 'local-only'
  }
  const { integrity, version } = opts.downloadIfMissing
  return `dl:${version}:${integrity ?? ''}`
}

export async function doResolveCdxgen(
  opts?: ResolveCdxgenOptions | undefined,
): Promise<ResolvedCdxgen | undefined> {
  const fromVfs = await cdxgenFromVfs()
  /* c8 ignore start - smol Node binary only. */
  if (fromVfs) {
    return fromVfs
  }
  /* c8 ignore stop */
  const fromPath = await cdxgenFromPath()
  if (fromPath) {
    return fromPath
  }
  if (opts?.downloadIfMissing) {
    return cdxgenFromDownload(opts.downloadIfMissing)
  }
  return undefined
}

export function resolveCdxgen(
  opts?: ResolveCdxgenOptions | undefined,
): Promise<ResolvedCdxgen | undefined> {
  const key = cacheKey(opts)
  let cached = _resolutionCache.get(key)
  if (!cached) {
    cached = doResolveCdxgen(opts)
    _resolutionCache.set(key, cached)
  }
  return cached
}
