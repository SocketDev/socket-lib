/**
 * @file `sbtFromDownload()` — fetches the SBT launcher tarball, extracts it,
 *   and returns a `ResolvedSbt` pointing at the `bin/sbt` script. SBT
 *   distributes a single platform-agnostic tgz containing a `bin/sbt` script
 *   plus `bin/sbt-launch.jar`. The `bin/sbt` form is directly invocable (it
 *   shells out to `java -jar` internally), so `isJar: false` even though the
 *   underlying machinery is a JAR. Default cache layout:
 *   `<dlxDir>/sbt/<version>/`. Trust-on-first-use: pass `integrity` from
 *   `external-tools.json` when available.
 */

import path from 'node:path'

import { getSocketDlxDir } from '../../paths/socket'
import { downloadAndExtractTool } from '../from-download'

import { getSbtDownloadUrl } from './asset-names'

import type { BinaryDownloader } from '../from-download'
import type { HashSpec } from '../../integrity'
import type { ResolvedSbt } from './types'

export interface SbtFromDownloadOptions {
  /**
   * SBT release version, e.g. `'1.10.7'`.
   */
  version: string
  /**
   * Optional pinned integrity from `external-tools.json`.
   */
  integrity?: HashSpec | undefined
  /**
   * Override the cache directory. Default:
   * `<getSocketDlxDir()>/sbt/<version>/`.
   */
  cacheDir?: string | undefined
  /**
   * Inject a custom downloader. Forwarded to the underlying
   * `downloadAndExtractTool`. Defaults to dlx.
   */
  downloader?: BinaryDownloader | undefined
}

/**
 * Resolve SBT by downloading and extracting the upstream tgz. Returns the
 * standard `ResolvedSbt` shape with `source: 'download'`.
 *
 * @example
 *   ;```typescript
 *   const sbt = await sbtFromDownload({ version: '1.10.7' })
 *   // → { path: '/.../bin/sbt', isJar: false, source: 'download' }
 *   ```
 */
export async function sbtFromDownload(
  opts: SbtFromDownloadOptions,
): Promise<ResolvedSbt | undefined> {
  const { cacheDir, downloader, integrity, version } = opts
  const url = getSbtDownloadUrl({ version })
  const extractedDir = cacheDir ?? path.join(getSocketDlxDir(), 'sbt', version)
  // strip:1 unwraps the top-level `sbt/` directory the tgz contains,
  // so `bin/sbt` lands at extractedDir/bin/sbt.
  await downloadAndExtractTool({
    url,
    // `.tgz` suffix is load-bearing: extractArchive auto-detects
    // format from the cached filename's extension.
    name: `sbt-${version}.tgz`,
    integrity,
    extractedDir,
    extractOptions: { strip: 1 },
    downloader,
  })
  return {
    path: path.join(extractedDir, 'bin', 'sbt'),
    isJar: false,
    source: 'download',
  }
}
