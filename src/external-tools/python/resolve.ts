/**
 * @file `resolvePython()` — CPython resolution entry point. Tries each source
 *   in order:
 *
 *   1. PATH — `python3` / `python` on the system PATH.
 *   2. download — python-build-standalone CPython into the DLX cache (only when
 *      `downloadIfMissing` is passed). Returns `undefined` if all enabled
 *      sources miss. Memoized per option-shape so repeated calls in one process
 *      don't re-probe / re-download. NOTE: unlike the JRE / removed-uv
 *      resolvers there is no VFS tier here — a CPython runtime is not embedded
 *      in the smol Node binary. Add a `from-vfs` tier here if that changes.
 */

import { getPythonArch } from './asset-names'
import { pythonFromDownload } from './from-download'
import { pythonFromPath } from './from-path'

import { MapCtor } from '../../primordials/map-set'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { ResolvedPython } from './types'

export interface ResolvePythonOptions {
  /**
   * Prefer a downloaded python-build-standalone over a PATH interpreter. Use
   * when you need an exact, reproducible CPython (the host `python3` may be the
   * wrong version). Default false: PATH wins when present.
   */
  preferDownload?: boolean | undefined
  /**
   * When set, fall back to downloading python-build-standalone if no PATH
   * interpreter is found (or always, with `preferDownload`).
   */
  downloadIfMissing?:
    | {
        version: string
        tag: string
        /**
         * Omit to auto-detect the current host via {@link getPythonArch}.
         */
        arch?: string | undefined
        integrity?: HashSpec | undefined
        cacheDir?: string | undefined
        downloader?: BinaryDownloader | undefined
      }
    | undefined
}

const resolutionCache = new MapCtor<
  string,
  Promise<ResolvedPython | undefined>
>()

export function cacheKey(opts: ResolvePythonOptions | undefined): string {
  const prefer = opts?.preferDownload ? 'prefer:' : ''
  if (!opts?.downloadIfMissing) {
    return `${prefer}local-only`
  }
  const { cacheDir, integrity, tag, version } = opts.downloadIfMissing
  // Resolve the effective platform-arch so a host-auto-detect call and an
  // explicit-matching call share one cache slot (and don't key on `undefined`).
  const arch = opts.downloadIfMissing.arch ?? getPythonArch() ?? 'unknown'
  const integrityKey =
    typeof integrity === 'string'
      ? integrity
      : integrity
        ? `${integrity.type}:${integrity.value}`
        : ''
  return `${prefer}dl:${version}:${tag}:${arch}:${integrityKey}:${cacheDir ?? ''}`
}

export async function doResolvePython(
  opts?: ResolvePythonOptions | undefined,
): Promise<ResolvedPython | undefined> {
  const dl = opts?.downloadIfMissing
  if (opts?.preferDownload && dl) {
    const fromDownload = await pythonFromDownload(dl)
    if (fromDownload) {
      return fromDownload
    }
  }
  const fromPath = await pythonFromPath()
  if (fromPath) {
    return fromPath
  }
  if (dl) {
    return pythonFromDownload(dl)
  }
  return undefined
}

/* c8 ignore start - test-only escape hatch. */
export function resetPythonResolution(): void {
  resolutionCache.clear()
}
/* c8 ignore stop */

export function resolvePython(
  opts?: ResolvePythonOptions | undefined,
): Promise<ResolvedPython | undefined> {
  const key = cacheKey(opts)
  let cached = resolutionCache.get(key)
  if (!cached) {
    cached = doResolvePython(opts)
    resolutionCache.set(key, cached)
  }
  return cached
}
