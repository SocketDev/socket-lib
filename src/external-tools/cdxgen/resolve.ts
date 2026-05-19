/**
 * @file `resolveCdxgen()` — cdxgen resolution entry point. Tries each source in
 *   order:
 *
 *   1. VFS — smol binary's embedded cdxgen (if packed)
 *   2. PATH — `cdxgen` on the system PATH
 *   3. download — upstream SEA binary from the GitHub release (slim by default;
 *      pass `variant: 'full'` for the bun+deno-bundled flavor)
 *   4. npm — `@cyclonedx/cdxgen` npm package as a fallback (only when
 *      `downloadIfMissing.npmFallback` is set AND the SEA download didn't
 *      satisfy the request) Returns `undefined` if all of the enabled sources
 *      miss. Memoized per option-shape.
 */

import { cdxgenFromDownload } from './from-download'
import { cdxgenFromNpm } from './from-npm'
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
        /**
         * When the SEA download doesn't cover the requested platform-arch (none
         * today, future-proofing), fall through to the npm package. Defaults to
         * false — explicit opt-in only.
         */
        npmFallback?:
          | {
              integrity?: string | undefined
            }
          | true
          | undefined
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
  const { cacheDir, integrity, npmFallback, platformArch, variant, version } =
    opts.downloadIfMissing
  const integrityKey =
    typeof integrity === 'string'
      ? integrity
      : integrity
        ? `${integrity.type}:${integrity.value}`
        : ''
  return `dl:${version}:${platformArch}:${variant ?? 'slim'}:${integrityKey}:${cacheDir ?? ''}:${npmFallback ? '+npm' : ''}`
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
  const dl = opts?.downloadIfMissing
  if (!dl) {
    return undefined
  }
  const fromDownload = await cdxgenFromDownload(dl)
  if (fromDownload) {
    return fromDownload
  }
  if (dl.npmFallback) {
    const npmIntegrity =
      typeof dl.npmFallback === 'object' && dl.npmFallback?.integrity
        ? dl.npmFallback.integrity
        : undefined
    return cdxgenFromNpm({
      version: dl.version,
      ...(npmIntegrity ? { integrity: npmIntegrity } : {}),
    })
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
