/**
 * @file Public option / result interfaces for dlx binary operations. Split out
 *   of `dlx/binary.ts` so consumers can import these types without pulling in
 *   the implementation.
 *
 *   - `DlxBinaryOptions` — options for `dlxBinary` / `downloadBinary`
 *   - `DlxBinaryResult` — what `dlxBinary` returns
 *   - `DlxMetadata` — on-disk metadata schema for a cached binary
 */

import type { HashInput } from '../crypto/integrity.mjs'
import type { HttpDownloadWriteStreamFactory } from '../http-request/download-types.mjs'
import type { spawn } from '../process/spawn/child.mjs'
import type { SpawnOptions } from '../process/spawn/types.mjs'

export interface DlxBinaryOptions {
  /**
   * URL to download the binary from.
   */
  url: string

  /**
   * Create the stream that receives freshly downloaded bytes. This allows
   * callers to write directly into filesystem compression such as decmpfs.
   */
  createWriteStream?: HttpDownloadWriteStreamFactory | undefined

  /**
   * Extra request headers for the download, forwarded to `httpDownload`. The
   * cache key is derived from `url` and `name` only, so a rotated credential
   * reuses the existing entry instead of orphaning it.
   *
   * Needed for an asset behind auth: a private GitHub release answers an
   * unauthenticated request with a bare 404, which reads as "never published"
   * rather than "not allowed".
   */
  headers?: Record<string, string> | undefined

  /**
   * Optional name for the cached binary (defaults to URL hash).
   */
  name?: string | undefined

  /**
   * Expected hash for verification. Accepts either:
   *
   * - A bare SRI string (`sha(256|384|512)-<base64>`).
   * - A bare hex digest (64/96/128 chars), algorithm inferred by length.
   * - A parsed {@link Hash} (from `parseHash` / `computeHash`).
   *
   * This is the preferred field. `integrity` and `sha256` remain as lower-level
   * escapes; if both `hash` and one of those is set, `hash` wins for the
   * matching flavor.
   */
  hash?: HashInput | undefined

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
   * Run quietly, suppressing output. Aligns with npx --quiet/-q and pnpm
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
 * Metadata structure for cached binaries (.dlx-metadata.json). ONE schema
 * shared by the TypeScript `dlxBinary` path and the C++ stub extractor, so a
 * field added on one side has to land on the other or the two disagree about
 * the same file.
 *
 * Two fields are not self-describing: `cache_key` is the first 16 characters
 * of the SHA-512 hash and matches the cache directory's own name, and
 * `integrity` is an npm-style SRI hash (`sha512-<base64>`). Timestamps are Unix
 * milliseconds.
 *
 * @example
 *   // .dlx-metadata.json
 *   {
 *   "version": "1.0.0",
 *   "cache_key": "a1b2c3d4e5f67890",
 *   "timestamp": 1730332800000,
 *   "integrity": "sha512-abc123base64...",
 *   "size": 15000000,
 *   "source": { "type": "download", "url": "https://example.com/binary" },
 *   "update_check": {
 *   "last_check": 1730332800000,
 *   "last_notification": 1730246400000,
 *   "latest_known": "2.1.0"
 *   }
 *   }
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
