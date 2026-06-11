/**
 * @file Generic "download tier" for external-tools resolvers. The per-tool
 *   resolvers (jre, bazel, sbt) each have local-discovery tiers — VFS, env-var
 *   pointer, system PATH. This module adds two helpers covering the fourth
 *   tier:
 *
 *   - `downloadToolArchive` — fetch the archive into the dlx cache, return the
 *     path + computed integrity. Stops at "bytes on disk."
 *   - `downloadAndExtractTool` — chains `downloadToolArchive` into
 *     `archives.extractArchive`. Returns the extracted directory path plus the
 *     integrity. Idempotent: skips extraction when the output directory already
 *     has content. What this does NOT do:
 *   - Pick the URL. Adoptium / Bazel-mirror / Maven URL construction is
 *     consumer-specific; these helpers take a URL and run with it.
 *   - Build a `Resolved*` record. The caller knows the per-tool layout (which
 *     subdirectory holds the executable) and constructs the final `ResolvedJre`
 *     / `ResolvedBazel` / `ResolvedSbt`. Trust-on-first-use:
 *   - First call with no `integrity`: downloads, returns the computed
 *     sha512-<base64> in the result. Caller writes it back to
 *     `external-tools.json` (or wherever the pin lives).
 *   - Subsequent calls with `integrity` set: downloads, verifies against the pin,
 *     returns the same value. Customization:
 *   - `downloader?` lets tests inject a fake fetch, and gives fleet consumers an
 *     escape hatch for alternate cache backends, retry logic, or progress
 *     reporters.
 */

import { existsSync } from 'node:fs'
import { promises as fsPromises } from 'node:fs'

import { extractArchive } from '../archives/extract'
import { safeMkdir } from '../fs/safe'

import { downloadBinary } from '../dlx/binary-download'

import type { ExtractOptions } from '../archives/types'
import type { HashSpec } from '../integrity'

/**
 * Result of `downloadAndExtractTool`. Extends `DownloadedArchive` with the
 * extracted directory path and an `extracted` flag indicating whether this call
 * performed extraction (vs. reusing an existing extracted tree).
 */
export interface ExtractedTool extends DownloadedArchive {
  /**
   * Absolute path to the directory where the archive was extracted.
   */
  readonly extractedDir: string
  /**
   * Whether this call extracted (vs. found the directory already populated).
   * Idempotent re-runs see `extracted: false`.
   */
  readonly extracted: boolean
}

export interface DownloadAndExtractOptions extends DownloadOptions {
  /**
   * Absolute path of the directory to extract into. Created if missing.
   * Idempotent: when the directory exists and is non-empty, extraction is
   * skipped and the existing tree is returned.
   */
  extractedDir: string
  /**
   * Pass-through options to `archives.extractArchive` — covers `strip` for
   * tar-style leading-component stripping plus the security-limit knobs
   * (maxEntries, maxFileSize, maxTotalSize).
   */
  extractOptions?: ExtractOptions | undefined
}

/**
 * Download an archive (with integrity verification) and extract it into
 * `extractedDir`. Idempotent: if `extractedDir` already exists and is
 * non-empty, extraction is skipped — the helper still downloads (or cache-hits)
 * the archive so the integrity is surfaced consistently.
 *
 * @example
 *   ;```typescript
 *   const { extractedDir, integrity } = await downloadAndExtractTool({
 *     url: 'https://example.com/jre-21-darwin-arm64.tar.gz',
 *     name: 'jre-21-darwin-arm64',
 *     extractedDir: '/Users/<user>/.cache/socket/jre/21/darwin-arm64',
 *     extractOptions: { strip: 1 },
 *   })
 *   // Caller constructs ResolvedJre from extractedDir.
 *   ```
 */
export async function downloadAndExtractTool(
  options: DownloadAndExtractOptions,
): Promise<ExtractedTool> {
  const archive = await downloadToolArchive(options)
  const { extractOptions, extractedDir } = {
    __proto__: null,
    ...options,
  } as typeof options
  // Skip extraction when the target dir already has content. Empty
  // dir → treat as not-yet-extracted (handles a half-created mkdir).
  let extracted = false
  if (existsSync(extractedDir)) {
    const entries = await fsPromises.readdir(extractedDir)
    if (entries.length === 0) {
      await extractArchive(archive.archivePath, extractedDir, extractOptions)
      extracted = true
    }
  } else {
    await safeMkdir(extractedDir)
    await extractArchive(archive.archivePath, extractedDir, extractOptions)
    extracted = true
  }
  return {
    ...archive,
    extractedDir,
    extracted,
  }
}

/**
 * SRI integrity (`sha512-<base64>`) of a downloaded archive, surfaced on the
 * per-tool `Resolved*` shapes. Set ONLY when `source === 'download'`; the
 * local-discovery tiers (vfs / env-pointer / path) reference bytes already on
 * disk and don't compute a fresh hash. Use for trust-on-first-use: capture
 * after the first download and write back to `external-tools.json` so
 * subsequent calls verify against the pin.
 */
export type ResolvedToolIntegrity = string | undefined

/**
 * Result of a from-download tier call. `source: 'download'` mirrors the
 * discriminator convention used by the per-tool `Resolved*` shapes so callers
 * can detect this branch in a `switch (source)`.
 */
export interface DownloadedArchive {
  /**
   * Absolute path to the cached archive file on disk.
   */
  readonly archivePath: string
  /**
   * Whether this call actually fetched (vs. cache hit).
   */
  readonly downloaded: boolean
  /**
   * SRI integrity (`sha512-<base64>`) of the cached archive. Returned on every
   * call — pin this in `external-tools.json` after first download.
   */
  readonly integrity: string
  /**
   * Discriminator — always `'download'` for this tier.
   */
  readonly source: 'download'
}

/**
 * Optional downloader injection. Default: `dlx/binary-download.downloadBinary`.
 * Replace when: - Writing unit tests that need a fake fetch (no network). -
 * Wiring an alternate cache backend or progress reporter. - Adding
 * fleet-specific instrumentation (metrics, retry).
 */
export type BinaryDownloader = typeof downloadBinary

export interface DownloadOptions {
  /**
   * Archive URL. Caller picks this per target — e.g. an Adoptium release asset
   * for JREs, a Bazel mirror for Bazel, a Maven URL for an SBT launcher.
   */
  url: string
  /**
   * Cache identity. The dlx layer keys the cache off `url + name`, so a stable
   * `name` per logical artifact is required for cross-process cache reuse.
   */
  name: string
  /**
   * Optional pinned integrity. When set, the download is verified against this
   * hash. Omit on first use to let the helper compute and return the integrity,
   * then pin it for future calls.
   */
  integrity?: HashSpec | undefined
  /**
   * Inject a custom downloader. Defaults to dlx.
   */
  downloader?: BinaryDownloader | undefined
}

/**
 * Fetch a tool archive into the dlx cache with optional integrity verification.
 * Returns the cached path plus the SRI integrity for trust-on-first-use
 * pinning.
 *
 * @example
 *   ;```typescript
 *   // First call — no pin yet.
 *   const r = await downloadToolArchive({
 *     url: 'https://api.adoptium.net/v3/binary/...',
 *     name: 'adoptium-jre-21-darwin-arm64',
 *   })
 *   // Caller writes r.integrity into external-tools.json.
 *
 *   // Subsequent calls — verified against the pin.
 *   const r = await downloadToolArchive({
 *     url,
 *     name,
 *     integrity: pinnedFromManifest,
 *   })
 *   ```
 */
export async function downloadToolArchive(
  options: DownloadOptions,
): Promise<DownloadedArchive> {
  const { downloader, integrity, name, url } = {
    __proto__: null,
    ...options,
  } as typeof options
  const download = downloader ?? downloadBinary
  const result = await download({
    url,
    name,
    hash: integrity,
  })
  return {
    archivePath: result.binaryPath,
    downloaded: result.downloaded,
    integrity: result.integrity,
    source: 'download',
  }
}
