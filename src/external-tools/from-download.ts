/**
 * @fileoverview Generic "download tier" for external-tools resolvers.
 *
 * The per-tool resolvers (jre, bazel, sbt) each have local-discovery
 * tiers — VFS, env-var pointer, system PATH. This helper adds a fourth
 * option: fetch the archive from a URL into the dlx cache with
 * integrity verification, and return a typed record describing the
 * cached download.
 *
 * What this does NOT do:
 *   - Extract the archive. socket-lib doesn't yet ship a tar.gz / zip
 *     decompressor. Callers (or a future `extract` helper) handle
 *     extraction and construct their own `ResolvedJre` / `ResolvedBazel`
 *     / `ResolvedSbt` from the extracted tree.
 *   - Pick the URL. Adoptium / Bazel-mirror / Maven URL construction
 *     is consumer-specific; this helper takes a URL and runs with it.
 *
 * Trust-on-first-use:
 *   - First call with no `integrity`: downloads, returns the computed
 *     sha512-<base64> in the result. Caller writes it back to
 *     `external-tools.json` (or wherever the pin lives).
 *   - Subsequent calls with `integrity` set: downloads, verifies
 *     against the pin, returns the same value.
 *
 * Customization:
 *   - `downloader?` lets tests inject a fake fetch, and gives fleet
 *     consumers an escape hatch for alternate cache backends, retry
 *     logic, or progress reporters.
 */

import { downloadBinary } from '../dlx/binary-download'

import type { HashSpec } from '../integrity'

/**
 * Result of a from-download tier call. `source: 'download'` mirrors
 * the discriminator convention used by the per-tool `Resolved*`
 * shapes so callers can detect this branch in a `switch (source)`.
 */
export interface DownloadedArchive {
  /** Absolute path to the cached archive file on disk. */
  readonly archivePath: string
  /** Whether this call actually fetched (vs. cache hit). */
  readonly downloaded: boolean
  /**
   * SRI integrity (`sha512-<base64>`) of the cached archive. Returned
   * on every call — pin this in `external-tools.json` after first
   * download.
   */
  readonly integrity: string
  /** Discriminator — always `'download'` for this tier. */
  readonly source: 'download'
}

/**
 * Optional downloader injection. Default: `dlx/binary-download.downloadBinary`.
 * Replace when:
 *   - Writing unit tests that need a fake fetch (no network).
 *   - Wiring an alternate cache backend or progress reporter.
 *   - Adding fleet-specific instrumentation (metrics, retry).
 */
export type BinaryDownloader = typeof downloadBinary

export interface DownloadOptions {
  /**
   * Archive URL. Caller picks this per target — e.g. an Adoptium
   * release asset for JREs, a Bazel mirror for Bazel, a Maven URL
   * for an SBT launcher.
   */
  url: string
  /**
   * Cache identity. The dlx layer keys the cache off `url + name`,
   * so a stable `name` per logical artifact is required for
   * cross-process cache reuse.
   */
  name: string
  /**
   * Optional pinned integrity. When set, the download is verified
   * against this hash. Omit on first use to let the helper compute
   * and return the integrity, then pin it for future calls.
   */
  integrity?: HashSpec | undefined
  /**
   * Inject a custom downloader. Defaults to dlx.
   */
  downloader?: BinaryDownloader | undefined
}

/**
 * Fetch a tool archive into the dlx cache with optional integrity
 * verification. Returns the cached path plus the SRI integrity for
 * trust-on-first-use pinning.
 *
 * @example
 * ```typescript
 * // First call — no pin yet.
 * const r = await downloadToolArchive({
 *   url: 'https://api.adoptium.net/v3/binary/...',
 *   name: 'adoptium-jre-21-darwin-arm64',
 * })
 * // Caller writes r.integrity into external-tools.json.
 *
 * // Subsequent calls — verified against the pin.
 * const r = await downloadToolArchive({
 *   url, name,
 *   integrity: pinnedFromManifest,
 * })
 * ```
 */
export async function downloadToolArchive(
  opts: DownloadOptions,
): Promise<DownloadedArchive> {
  const { downloader, integrity, name, url } = opts
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
