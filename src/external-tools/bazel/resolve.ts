/**
 * @file `resolveBazel()` — Bazel resolution entry point. Tries each source in
 *   order:
 *
 *   1. PATH — `bazelisk` (preferred) or `bazel` on the system PATH
 *   2. download — upstream GitHub release binary (only when `downloadIfMissing` is
 *      passed) No VFS tier: Bazel's version comes from the project's
 *      `.bazelversion`, not from a global pin, so a smol-bundled Bazel would
 *      always be the wrong version for any project that pinned a different one.
 *      Every Bazel use must go through the project-specific download path.
 *      Returns `undefined` if all of the enabled sources miss. Memoized per
 *      option-shape: calls with identical options return the same cached
 *      promise. Calling without `downloadIfMissing` and then with
 *      `downloadIfMissing` produces two distinct cache entries so the second
 *      call can fall through to the download tier.
 */

import { bazelFromDownload } from './from-download'
import { bazelFromPath } from './from-path'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { ResolvedBazel } from './types'

export interface ResolveBazelOptions {
  /**
   * When set, the resolver falls through to a GitHub release download after the
   * local-discovery tiers miss. Omit to keep the resolver read-only.
   */
  downloadIfMissing?:
    | {
        version: string
        platformArch: string
        integrity?: HashSpec | undefined
        downloader?: BinaryDownloader | undefined
      }
    | undefined
}

const resolutionCache = new Map<string, Promise<ResolvedBazel | undefined>>()

export function cacheKey(opts: ResolveBazelOptions | undefined): string {
  if (!opts?.downloadIfMissing) {
    return 'local-only'
  }
  const { integrity, platformArch, version } = opts.downloadIfMissing
  const integrityKey =
    typeof integrity === 'string'
      ? integrity
      : integrity
        ? `${integrity.type}:${integrity.value}`
        : ''
  return `dl:${version}:${platformArch}:${integrityKey}`
}

export async function doResolveBazel(
  opts?: ResolveBazelOptions | undefined,
): Promise<ResolvedBazel | undefined> {
  const fromPath = await bazelFromPath()
  if (fromPath) {
    return fromPath
  }
  if (opts?.downloadIfMissing) {
    return bazelFromDownload(opts.downloadIfMissing)
  }
  return undefined
}

/* c8 ignore start - test-only escape hatch. */
export function resetBazelResolution(): void {
  resolutionCache.clear()
}
/* c8 ignore stop */

export function resolveBazel(
  opts?: ResolveBazelOptions | undefined,
): Promise<ResolvedBazel | undefined> {
  const key = cacheKey(opts)
  let cached = resolutionCache.get(key)
  if (!cached) {
    cached = doResolveBazel(opts)
    resolutionCache.set(key, cached)
  }
  return cached
}
