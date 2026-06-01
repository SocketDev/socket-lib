/**
 * @file Public option / result interfaces for dlx binary operations. Split out
 *   of `dlx/binary.ts` so consumers can import these types without pulling in
 *   the implementation.
 *
 *   - `DlxBinaryOptions` — options for `dlxBinary` / `downloadBinary`
 *   - `DlxBinaryResult` — what `dlxBinary` returns
 *   - `DlxMetadata` — on-disk metadata schema for a cached binary
 */

import type { HashSpec } from '../integrity'
import type { spawn } from '../process/spawn/child'
import type { SpawnOptions } from '../process/spawn/types'

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
   *
   * - A bare sha512 SRI string (`sha512-<base64>`), sniffed as integrity.
   * - A bare sha256 hex string (64 hex chars), sniffed as checksum.
   * - An explicit `{ type: 'integrity' | 'checksum', value }` object.
   *
   * This is the preferred field. `integrity` and `sha256` remain as lower-level
   * escapes; if both `hash` and one of those is set, `hash` wins for the
   * matching flavor.
   */
  hash?: HashSpec | undefined

  /**
   * Expected SRI integrity hash (sha512-<base64>) for verification. Lower-level
   * alternative to `hash`.
   */
  integrity?: string | undefined

  /**
   * Expected SHA-256 hex checksum for verification. Passed to httpDownload for
   * inline verification during download. This is more secure than post-download
   * verification as it fails early. Lower-level alternative to `hash`.
   */
  sha256?: string | undefined

  /**
   * Cache TTL in milliseconds (default: 7 days).
   */
  cacheTtl?: number | undefined

  /**
   * Force re-download even if cached. Aligns with npm/npx --force flag.
   */
  force?: boolean | undefined

  /**
   * Skip confirmation prompts (auto-approve). Aligns with npx --yes/-y flag.
   */
  yes?: boolean | undefined

  /**
   * Suppress output (quiet mode). Aligns with npx --quiet/-q and pnpm
   * --silent/-s flags.
   */
  quiet?: boolean | undefined

  /**
   * Additional spawn options.
   */
  spawnOptions?: SpawnOptions | undefined
}

export interface DlxBinaryResult {
  /**
   * Path to the cached binary.
   */
  binaryPath: string
  /**
   * Whether the binary was newly downloaded.
   */
  downloaded: boolean
  /**
   * The spawn promise for the running process.
   */
  spawnPromise: ReturnType<typeof spawn>
}

/**
 * Metadata structure for cached binaries (.dlx-metadata.json). Unified schema
 * shared across TypeScript (dlxBinary) and C++ stub extractor.
 *
 * Fields:
 *
 * - Version: Schema version (currently "1.0.0")
 * - Cache_key: First 16 chars of SHA-512 hash (matches directory name)
 * - Timestamp: Unix timestamp in milliseconds
 * - Integrity: SRI hash (sha512-<base64>, aligned with npm)
 * - Size: Size of cached binary in bytes
 * - Source: Origin information
 *
 *   - Type: "download" | "extract" | "package"
 *   - Url: Download URL (if type is "download")
 *   - Path: Source binary path (if type is "extract")
 *   - Spec: Package spec (if type is "package")
 * - Update_check: Update checking metadata (optional)
 *
 *   - Last_check: Timestamp of last update check
 *   - Last_notification: Timestamp of last user notification
 *   - Latest_known: Latest known version string
 *
 * Example:
 *
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
  source?:
    | {
        type: 'download' | 'extract' | 'package'
        url?: string | undefined
        path?: string | undefined
        spec?: string | undefined
      }
    | undefined
  update_check?:
    | {
        last_check: number
        last_notification: number
        latest_known: string
      }
    | undefined
}
