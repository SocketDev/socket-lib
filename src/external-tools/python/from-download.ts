/**
 * @file `pythonFromDownload()` — fetches a python-build-standalone CPython into
 *   the DLX cache and returns a `ResolvedPython` pointing at the interpreter.
 *   The `install_only` tarball extracts to a `python/` subdirectory, so the
 *   interpreter lands at `<extractedDir>/python/bin/python3` (or
 *   `python/python.exe` on Windows) — no strip.
 */

import path from 'node:path'
import process from 'node:process'

import { getSocketDlxDir } from '../../paths/socket'
import { downloadAndExtractTool } from '../from-download'

import { getPythonArch, pythonAsset } from './asset-names'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { ResolvedPython } from './types'

export interface PythonFromDownloadOptions {
  /**
   * CPython version, e.g. `3.11.14`.
   */
  version: string
  /**
   * Python-build-standalone release tag, e.g. `20260203`.
   */
  tag: string
  /**
   * Target `platform-arch`, e.g. `darwin-arm64`. Omit to auto-detect the
   * current host via {@link getPythonArch}.
   */
  arch?: string | undefined
  /**
   * Optional pinned integrity (hex SHA-256 or SRI) for the tarball.
   */
  integrity?: HashSpec | undefined
  /**
   * Override the extraction directory. Defaults to
   * `~/.socket/_dlx/python/<version>-<tag>-<arch>`.
   */
  cacheDir?: string | undefined
  /**
   * Inject a custom downloader (tests / alternate cache). Defaults to dlx.
   */
  downloader?: BinaryDownloader | undefined
}

/**
 * Return the absolute path to the interpreter inside an extracted
 * python-build-standalone tree. The layout follows the TARGET arch, not the
 * host: a Windows target nests the interpreter at `python/python.exe`, every
 * other target at `python/bin/python3`. Keying off `process.platform` would be
 * wrong when cross-resolving (e.g. a Windows host downloading a linux-x64
 * build). `arch` is a platform-arch key like `win-x64` / `linux-x64`; omit it
 * to fall back to the host platform.
 */
export function pythonBinPath(
  extractedDir: string,
  arch?: string | undefined,
): string {
  const isWin = arch ? arch.startsWith('win-') : process.platform === 'win32'
  if (isWin) {
    return path.join(extractedDir, 'python', 'python.exe')
  }
  return path.join(extractedDir, 'python', 'bin', 'python3')
}

/**
 * Default DLX cache directory for a python build pin.
 */
export function pythonCacheDir(
  version: string,
  tag: string,
  arch: string,
): string {
  return path.join(getSocketDlxDir(), 'python', `${version}-${tag}-${arch}`)
}

export async function pythonFromDownload(
  opts: PythonFromDownloadOptions,
): Promise<ResolvedPython | undefined> {
  const { cacheDir, downloader, integrity, tag, version } = opts
  // Resolve the effective platform-arch ONCE so the asset URL and the cache
  // path agree (a stray undefined here would poison the cache dir name).
  const arch = opts.arch ?? getPythonArch()
  if (!arch) {
    return undefined
  }
  const asset = pythonAsset({ version, tag, arch })
  if (!asset) {
    return undefined
  }
  const extractedDir = cacheDir ?? pythonCacheDir(version, tag, arch)
  // No strip — the install_only archive already nests under `python/`.
  const archive = await downloadAndExtractTool({
    url: asset.url,
    name: `python-${version}-${tag}-${arch}.tar.gz`,
    integrity,
    extractedDir,
    downloader,
  })
  return {
    path: pythonBinPath(extractedDir, arch),
    source: 'download',
    integrity: archive.integrity,
  }
}
