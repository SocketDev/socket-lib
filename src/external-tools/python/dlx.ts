/**
 * @file One-call dlx convenience wrappers for python: resolve (or download) a
 *   CPython into the known dlx location, then run a pip primitive against it —
 *   so callers don't thread `pythonBin` by hand. Mirrors how `dlx/package.ts`'s
 *   `dlxPackage` wraps `downloadNpmPackage`.
 *
 *   The dlx Python path is deterministic given the pin
 *   (`pythonCacheDir(version, tag, arch)` → `~/.socket/_dlx/python/...`), so the
 *   wrapper resolves to that known location and hands the interpreter path to
 *   the pip fn itself:
 *
 *   - `dlxPipInstall({ python, spec })` → `resolvePython` + `downloadPipPackage`
 *   - `dlxPipPin({ python, spec })`     → `resolvePython` + `resolvePipPackagePin`
 *
 *   The lower-level primitives (`downloadPipPackage`, `resolvePipPackagePin`)
 *   keep `pythonBin` required — they're the interpreter-agnostic layer. Use them
 *   directly when you already hold an interpreter path; use these wrappers when
 *   you have a pin and want one call.
 */

import { downloadPipPackage } from './pip-install'
import { resolvePipPackagePin } from './pin'
import { resolvePython } from './resolve'

import type { DownloadPipPackageResult } from './pip-install'
import type { PipPackagePin } from './pin'
import type { PythonBuildPin } from './types'

export interface DlxPipOptions {
  /**
   * python-build-standalone pin (version + tag + optional integrity). The dlx
   * interpreter location is derived from this — that's why no `pythonBin` is
   * needed. Omit `arch` to auto-detect the host.
   */
  readonly python: PythonBuildPin & { readonly arch?: string | undefined }
  /**
   * Prefer the downloaded dlx CPython over any PATH interpreter. Default false:
   * a PATH `python3` wins when present, the dlx build is the fallback. Pass
   * `true` for an exact, reproducible interpreter regardless of host Python.
   */
  readonly preferDownload?: boolean | undefined
}

export interface DlxPipInstallOptions extends DlxPipOptions {
  /**
   * Optional sha256 hash of the top-level artifact, forwarded to
   * `downloadPipPackage` (pip `--require-hashes`).
   */
  readonly hash?: string | undefined
  /**
   * pip install spec: `<pkg>==<version>` or `git+https://<url>@<sha>`.
   */
  readonly spec: string
}

export interface DlxPipPinOptions extends DlxPipOptions {
  /**
   * pip spec to pin: `<pkg>==<version>` or `git+https://<url>@<sha>`.
   */
  readonly spec: string
}

/**
 * Thrown when the python pin can't be resolved to an interpreter (no PATH
 * Python and the download tier missed — e.g. unsupported host arch).
 */
export class DlxPythonUnavailableError extends Error {
  constructor(
    message: string,
    options?: { cause?: unknown | undefined } | undefined,
  ) {
    super(message, options)
    this.name = 'DlxPythonUnavailableError'
  }
}

/**
 * Resolve (or download) the dlx CPython for `python`, then pip-install `spec`
 * into a content-addressed dlx dir. One-call form of `resolvePython` +
 * `downloadPipPackage`. The returned result includes the interpreter path used,
 * so callers can run the tool: `spawn(pythonBin, ['-m', '<module>'], { env: {
 * PYTHONPATH: packageDir } })`.
 */
export async function dlxPipInstall(
  opts: DlxPipInstallOptions,
): Promise<DownloadPipPackageResult & { pythonBin: string }> {
  const pythonBin = await resolveOrThrow(opts)
  const result = await downloadPipPackage({
    hash: opts.hash,
    pythonBin,
    spec: opts.spec,
  })
  return { ...result, pythonBin }
}

/**
 * Resolve (or download) the dlx CPython for `python`, then generate a
 * hash-pinned closure for `spec`. One-call form of `resolvePython` +
 * `resolvePipPackagePin`.
 */
export async function dlxPipPin(
  opts: DlxPipPinOptions,
): Promise<PipPackagePin & { pythonBin: string }> {
  const pythonBin = await resolveOrThrow(opts)
  const pin = await resolvePipPackagePin({ pythonBin, spec: opts.spec })
  return { ...pin, pythonBin }
}

export async function resolveOrThrow(opts: DlxPipOptions): Promise<string> {
  const { preferDownload, python } = opts
  const resolved = await resolvePython({
    preferDownload,
    downloadIfMissing: {
      arch: python.arch,
      integrity: python.integrity,
      tag: python.tag,
      version: python.version,
    },
  })
  if (!resolved) {
    throw new DlxPythonUnavailableError(
      `dlx python: could not resolve a CPython interpreter for ${python.version}+${python.tag} — no host python3 and the python-build-standalone download tier missed (unsupported host arch?)`,
    )
  }
  return resolved.path
}
