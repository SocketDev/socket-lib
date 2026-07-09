/**
 * @file `janusFromDownload()` — fetches upstream janus and returns a
 *   `ResolvedJanus` pointing at the extracted binary. janus ships tar.gz
 *   archives containing a bare `janus` binary at the archive root (no nested
 *   directory). Defaults install under the shared wheelhouse dir
 *   (`~/.socket/_wheelhouse/janus/<version>/<platform-arch>/`) rather than the
 *   per-process dlx cache, so multiple Socket consumers reuse the same
 *   extracted binary.
 */

import path from 'node:path'

import { getSocketWheelhouseDir } from '../../paths/socket'
import { downloadAndExtractTool } from '../from-download'

import {
  getJanusDownloadUrl,
  JANUS_SUPPORTED_PLATFORM_ARCHES,
} from './asset-names'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { ResolvedJanus } from './types'

import { ErrorCtor } from '../../primordials/error'

export interface JanusFromDownloadOptions {
  version: string
  platformArch: string
  integrity?: HashSpec | undefined
  /**
   * Override the install directory. By default the binary lands in
   * `<getSocketWheelhouseDir()>/janus/<version>/<platformArch>/` — a shared
   * shared location so multiple Socket tools resolve the same binary
   * without per-process duplication.
   */
  cacheDir?: string | undefined
  downloader?: BinaryDownloader | undefined
}

export async function janusFromDownload(
  options: JanusFromDownloadOptions,
): Promise<ResolvedJanus> {
  const { cacheDir, downloader, integrity, platformArch, version } = {
    __proto__: null,
    ...options,
  } as typeof options
  if (!JANUS_SUPPORTED_PLATFORM_ARCHES.includes(platformArch)) {
    const supported = JANUS_SUPPORTED_PLATFORM_ARCHES.map(p => `\`${p}\``).join(
      ', ',
    )
    throw new ErrorCtor(
      `janusFromDownload: platformArch must be one of [${supported}], got \`${platformArch}\`. Upstream janus only publishes the macOS arm64 build (see https://github.com/divmain/janus/releases); request \`darwin-arm64\` or use a different tool for other platforms.`,
    )
  }
  const url = getJanusDownloadUrl({ version, platformArch })
  if (!url) {
    throw new ErrorCtor(
      `janusFromDownload: no upstream asset for janus@${version} on \`${platformArch}\`. The platform is in the supported set but the version may be missing; check https://github.com/divmain/janus/releases/tag/v${version}.`,
    )
  }
  const extractedDir =
    cacheDir ??
    path.join(getSocketWheelhouseDir(), 'janus', version, platformArch)
  const archive = await downloadAndExtractTool({
    url,
    name: `janus-${version}-${platformArch}.tar.gz`,
    integrity,
    extractedDir,
    downloader,
  })
  return {
    path: path.join(extractedDir, 'janus'),
    source: 'download',
    integrity: archive.integrity,
  }
}
