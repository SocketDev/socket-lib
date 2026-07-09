/**
 * @file `jreFromDownload()` — fetches Adoptium JRE and returns a `ResolvedJre`
 *   pointing at the extracted java binary. Wraps the generic
 *   `downloadAndExtractTool` with JRE-specific knowledge:
 *
 *   - URL construction via `getAdoptiumDownloadUrl`
 *   - default cache layout: `<dlxDir>/jre/<version>/<platform-arch>/`
 *   - locating `bin/java(.exe)` within the extracted tree Returns `undefined`
 *     when:
 *   - Adoptium has no build for the target `platformArch`
 *   - The extracted tree doesn't contain a recognizable JRE layout Idempotent —
 *     re-running with the same `{version, platformArch}` after a successful
 *     first run is a quick cache check, no network. Trust-on-first-use: pass
 *     `integrity` from `external-tools.json` when available. Omit it on first
 *     install; the helper logs the computed SRI through `result.integrity`
 *     (currently surfaced only as a side effect of the underlying call; future
 *     revision may surface it via an out-param so consumers can record the
 *     pin).
 */

import path from 'node:path'
import process from 'node:process'

import { getSocketDlxDir } from '../../paths/socket'
import { downloadAndExtractTool } from '../from-download'

import { getAdoptiumDownloadUrl } from './asset-names'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { ResolvedJre } from './types'

import { StringPrototypeStartsWith } from '../../primordials/string'

export interface JreFromDownloadOptions {
  /**
   * Java feature version (the major), e.g. `21`.
   */
  version: number
  /**
   * Socket platform-arch token, e.g. `'darwin-arm64'`.
   */
  platformArch: string
  /**
   * Optional pinned integrity from `external-tools.json`. When set, the
   * download is verified against this hash; verification failure throws (from
   * the dlx layer).
   */
  integrity?: HashSpec | undefined
  /**
   * Override the cache directory. By default the JRE extracts into
   * `<getSocketDlxDir()>/jre/<version>/<platformArch>/`.
   */
  cacheDir?: string | undefined
  /**
   * Inject a custom downloader. Forwarded to the underlying
   * `downloadAndExtractTool`. Defaults to dlx.
   */
  downloader?: BinaryDownloader | undefined
}

/**
 * Resolve a JRE by downloading it from Adoptium. Returns the standard
 * `ResolvedJre` shape with `source: 'download'`.
 *
 * @example
 *   ;```typescript
 *   const jre = await jreFromDownload({
 *     version: 21,
 *     platformArch: 'darwin-arm64',
 *   })
 *   // → { javaPath: '/.../bin/java', javaHome: '/...', source: 'download' }
 *   ```
 */
export async function jreFromDownload(
  options: JreFromDownloadOptions,
): Promise<ResolvedJre | undefined> {
  const { cacheDir, downloader, integrity, platformArch, version } = {
    __proto__: null,
    ...options,
  } as typeof options
  const url = getAdoptiumDownloadUrl({ version, platformArch })
  if (!url) {
    return undefined
  }
  const extractedDir =
    cacheDir ??
    path.join(getSocketDlxDir(), 'jre', String(version), platformArch)
  // Extension is load-bearing: extractArchive auto-detects format
  // from the cached filename. Adoptium ships `.tar.gz` on
  // mac/linux and `.zip` on windows.
  const archiveExt = StringPrototypeStartsWith(platformArch, 'win-')
    ? '.zip'
    : '.tar.gz'
  // strip:1 unwraps the top-level `jdk-21.0.x-jre/` directory that
  // Adoptium archives include, so the resulting tree has `bin/` etc.
  // at extractedDir root.
  const archive = await downloadAndExtractTool({
    url,
    name: `adoptium-jre-${version}-${platformArch}${archiveExt}`,
    integrity,
    extractedDir,
    extractOptions: { strip: 1 },
    downloader,
  })
  const javaBinary = process.platform === 'win32' ? 'java.exe' : 'java'
  // macOS Adoptium archives nest the runnable JRE under
  // `Contents/Home/`; other platforms put `bin/` at the top.
  const macHome = path.join(extractedDir, 'Contents', 'Home')
  const javaHome = process.platform === 'darwin' ? macHome : extractedDir
  return {
    javaPath: path.join(javaHome, 'bin', javaBinary),
    javaHome,
    source: 'download',
    integrity: archive.integrity,
  }
}
