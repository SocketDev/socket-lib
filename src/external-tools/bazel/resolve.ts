/**
 * @fileoverview `resolveBazel()` — Bazel resolution entry point.
 *
 * Tries each source in order:
 *
 *   1. VFS  — smol binary's embedded Bazel (if packed)
 *   2. PATH — `bazelisk` (preferred) or `bazel` on the system PATH
 *   3. download — upstream GitHub release binary (only when
 *      `downloadIfMissing` is passed)
 *
 * Returns `undefined` if all of the enabled sources miss.
 *
 * Memoized per option-shape: calls with identical options return the
 * same cached promise. Calling without `downloadIfMissing` and then
 * with `downloadIfMissing` produces two distinct cache entries so
 * the second call can fall through to the download tier.
 */

import { bazelFromDownload } from './from-download'
import { bazelFromPath } from './from-path'
import { bazelFromVfs } from './from-vfs'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { ResolvedBazel } from './types'

export interface ResolveBazelOptions {
  /**
   * When set, the resolver falls through to a GitHub release
   * download after the local-discovery tiers miss. Omit to keep the
   * resolver read-only.
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

const _resolutionCache = new Map<string, Promise<ResolvedBazel | undefined>>()

/* c8 ignore start - test-only escape hatch. */
export function _resetBazelResolution(): void {
  _resolutionCache.clear()
}
/* c8 ignore stop */

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
  const fromVfs = await bazelFromVfs()
  /* c8 ignore start - smol Node binary only. */
  if (fromVfs) {
    return fromVfs
  }
  /* c8 ignore stop */
  const fromPath = await bazelFromPath()
  if (fromPath) {
    return fromPath
  }
  if (opts?.downloadIfMissing) {
    return bazelFromDownload(opts.downloadIfMissing)
  }
  return undefined
}

export function resolveBazel(
  opts?: ResolveBazelOptions | undefined,
): Promise<ResolvedBazel | undefined> {
  const key = cacheKey(opts)
  let cached = _resolutionCache.get(key)
  if (!cached) {
    cached = doResolveBazel(opts)
    _resolutionCache.set(key, cached)
  }
  return cached
}
