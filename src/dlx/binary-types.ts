/**
 * @fileoverview Public option / result interfaces for dlx binary
 * operations. Split out of `dlx/binary.ts` so consumers can import
 * these types without pulling in the implementation.
 *
 *   - `DlxBinaryOptions` — options for `dlxBinary` / `downloadBinary`
 *   - `DlxBinaryResult` — what `dlxBinary` returns
 *   - `DlxMetadata` — on-disk metadata schema for a cached binary
 */

import type { HashSpec } from './integrity'
import type { spawn } from '../spawn/core'
import type { SpawnOptions } from '../spawn/types'

export interface DlxBinaryOptions {
  /**
   * URL to download the binary from.
   */
  url: string

  /**
   * Optional name for the cached binary (defaults to URL hash).
   */
  name?: string | undefined

  /**
   * Expected hash for verification. Accepts either:
   * - A bare sha512 SRI string (`sha512-<base64>`), sniffed as integrity.
   * - A bare sha256 hex string (64 hex chars), sniffed as checksum.
   * - An explicit `{ type: 'integrity' | 'checksum', value }` object.
   *
   * This is the preferred field. `integrity` and `sha256` remain as
   * lower-level escapes; if both `hash` and one of those is set, `hash`
   * wins for the matching flavor.
   */
  hash?: HashSpec | undefined

  /**
   * Expected SRI integrity hash (sha512-<base64>) for verification.
   * Lower-level alternative to `hash`.
   */
  integrity?: string | undefined

  /**
   * Expected SHA-256 hex checksum for verification.
   * Passed to httpDownload for inline verification during download.
   * This is more secure than post-download verification as it fails early.
   * Lower-level alternative to `hash`.
   */
  sha256?: string | undefined

  /**
   * Cache TTL in milliseconds (default: 7 days).
   */
  cacheTtl?: number | undefined

  /**
   * Force re-download even if cached.
   * Aligns with npm/npx --force flag.
   */
  force?: boolean | undefined

  /**
   * Skip confirmation prompts (auto-approve).
   * Aligns with npx --yes/-y flag.
   */
  yes?: boolean | undefined

  /**
   * Suppress output (quiet mode).
   * Aligns with npx --quiet/-q and pnpm --silent/-s flags.
   */
  quiet?: boolean | undefined

  /**
   * Additional spawn options.
   */
  spawnOptions?: SpawnOptions | undefined
}

export interface DlxBinaryResult {
  /** Path to the cached binary. */
  binaryPath: string
  /** Whether the binary was newly downloaded. */
  downloaded: boolean
  /** The spawn promise for the running process. */
  spawnPromise: ReturnType<typeof spawn>
}

/**
 * Metadata structure for cached binaries (.dlx-metadata.json).
 * Unified schema shared across TypeScript (dlxBinary) and C++ stub extractor.
 *
 * Fields:
 * - version: Schema version (currently "1.0.0")
 * - cache_key: First 16 chars of SHA-512 hash (matches directory name)
 * - timestamp: Unix timestamp in milliseconds
 * - integrity: SRI hash (sha512-<base64>, aligned with npm)
 * - size: Size of cached binary in bytes
 * - source: Origin information
 *   - type: "download" | "extract" | "package"
 *   - url: Download URL (if type is "download")
 *   - path: Source binary path (if type is "extract")
 *   - spec: Package spec (if type is "package")
 * - update_check: Update checking metadata (optional)
 *   - last_check: Timestamp of last update check
 *   - last_notification: Timestamp of last user notification
 *   - latest_known: Latest known version string
 *
 * Example:
 * ```json
 * {
 *   "version": "1.0.0",
 *   "cache_key": "a1b2c3d4e5f67890",
 *   "timestamp": 1730332800000,
 *   "integrity": "sha512-abc123base64...",
 *   "size": 15000000,
 *   "source": {
 *     "type": "download",
 *     "url": "https://example.com/binary"
 *   },
 *   "update_check": {
 *     "last_check": 1730332800000,
 *     "last_notification": 1730246400000,
 *     "latest_known": "2.1.0"
 *   }
 * }
 * ```
 *
 * @internal This interface documents the metadata file format.
 */
export interface DlxMetadata {
  version: string
  cache_key: string
  timestamp: number
  integrity: string
  size: number
  source?: {
    type: 'download' | 'extract' | 'package'
    url?: string
    path?: string
    spec?: string
  }
  update_check?: {
    last_check: number
    last_notification: number
    latest_known: string
  }
}
