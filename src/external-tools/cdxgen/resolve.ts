/**
 * @file `resolveCdxgen()` — cdxgen resolution entry point. Tries each source in
 *   order:
 *
 *   1. VFS — smol binary's embedded cdxgen (if packed)
 *   2. PATH — `cdxgen` on the system PATH
 *   3. download — upstream SEA binary from the GitHub release (slim by default;
 *      pass `variant: 'full'` for the bun+deno-bundled flavor) Single source of
 *      truth: SEA binary only. No npm-package fallback — every fleet
 *      platform-arch is covered by the SEA matrix, and routing through npm
 *      would split the install surface in two for no benefit. Returns
 *      `undefined` if all of the enabled sources miss. Memoized per
 *      option-shape.
 */

import { cdxgenFromDownload } from './from-download'
import { cdxgenFromPath } from './from-path'
import { cdxgenFromVfs } from './from-vfs'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { CdxgenVariant } from './asset-names'
import type { ResolvedCdxgen } from './types'

export interface ResolveCdxgenOptions {
  downloadIfMissing?:
    | {
        version: string
        platformArch: string
        variant?: CdxgenVariant | undefined
        integrity?: HashSpec | undefined
        cacheDir?: string | undefined
        downloader?: BinaryDownloader | undefined
      }
    | undefined
}

const resolutionCache = new Map<string, Promise<ResolvedCdxgen | undefined>>()

/* c8 ignore start - test-only escape hatch. */
export function resetCdxgenResolution(): void {
  resolutionCache.clear()
}
/* c8 ignore stop */

export function cacheKey(opts: ResolveCdxgenOptions | undefined): string {
  if (!opts?.downloadIfMissing) {
    return 'local-only'
  }
  const { cacheDir, integrity, platformArch, variant, version } =
    opts.downloadIfMissing
  const integrityKey =
    typeof integrity === 'string'
      ? integrity
      : integrity
        ? `${integrity.type}:${integrity.value}`
        : ''
  return `dl:${version}:${platformArch}:${variant ?? 'slim'}:${integrityKey}:${cacheDir ?? ''}`
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
  let cached = resolutionCache.get(key)
  if (!cached) {
    cached = doResolveCdxgen(opts)
    resolutionCache.set(key, cached)
  }
  return cached
}
