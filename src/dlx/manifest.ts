/**
 * @fileoverview DLX manifest storage utilities.
 * Manages persistent caching of DLX package and binary metadata with TTL support
 * and atomic file operations.
 *
 * Key Functions:
 * - getManifestEntry: Retrieve manifest entry by spec
 * - setPackageEntry: Store npm package metadata
 * - setBinaryEntry: Store binary download metadata
 *
 * Features:
 * - TTL-based cache expiration
 * - Atomic file operations with locking
 * - JSON-based persistent storage
 * - Error-resistant implementation
 *
 * Storage Format:
 * - Stores in ~/.socket/_dlx/.dlx-manifest.json
 * - Per-spec manifest entries with timestamps
 * - Thread-safe operations using process lock utility
 *
 * Usage:
 * - Update check caching
 * - Binary metadata tracking
 * - Rate limiting registry requests
 */

let _fs: typeof import('node:fs') | undefined
let _path: typeof import('node:path') | undefined
/**
 * Lazily load the fs module to avoid Webpack errors.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getFs() {
  if (_fs === undefined) {
    _fs = /*@__PURE__*/ require('fs')
  }
  return _fs as typeof import('node:fs')
}
/**
 * Lazily load the path module to avoid Webpack errors.
 * @private
 */
/*@__NO_SIDE_EFFECTS__*/
function getPath() {
  if (_path === undefined) {
    _path = /*@__PURE__*/ require('path')
  }
  return _path as typeof import('node:path')
}
import { readFileUtf8Sync, safeMkdirSync } from '../fs'
import { getDefaultLogger } from '../logger'
import { getSocketDlxDir } from '../paths/socket'
import { processLock } from '../process-lock'

const logger = getDefaultLogger()

/**
 * Manifest file name.
 */
const MANIFEST_FILE_NAME = '.dlx-manifest.json'

/**
 * Details for npm package entries.
 */
export interface PackageDetails {
  installed_version: string
  size?: number
  update_check?: {
    last_check: number
    last_notification: number
    latest_known: string
  }
}
/**
 * Details for binary download entries.
 */
export interface BinaryDetails {
  /** SRI integrity hash (sha512-<base64>, aligned with npm). */
  integrity: string
  platform: string
  arch: string
  size: number
  source: {
    type: 'download' | 'extract'
    url?: string
    path?: string
  }
  /** Update check metadata (same structure as packages). */
  update_check?: {
    last_check: number
    last_notification: number
    latest_known: string
  }
}

/**
 * Unified manifest entry for all cached items (packages and binaries).
 * Shared fields at root, type-specific fields in details.
 */
export interface ManifestEntry {
  type: 'package' | 'binary'
  cache_key: string
  timestamp: number
  details: PackageDetails | BinaryDetails
}
/**
 * Type guard for package entries.
 */
export function isPackageEntry(
  entry: ManifestEntry,
): entry is ManifestEntry & { details: PackageDetails } {
  return entry.type === 'package'
}
/**
 * Type guard for binary entries.
 */
export function isBinaryEntry(
  entry: ManifestEntry,
): entry is ManifestEntry & { details: BinaryDetails } {
  return entry.type === 'binary'
}
/**
 * Legacy store record format (deprecated, for migration).
 */
export interface StoreRecord {
  timestampFetch: number
  timestampNotification: number
  version: string
}
export interface DlxManifestOptions {
  /**
   * Custom manifest file path (defaults to ~/.socket/_dlx/.dlx-manifest.json).
   */
  manifestPath?: string
}
/**
 * DLX manifest storage manager with atomic operations.
 * Supports both legacy format (package name keys) and new unified manifest format (spec keys).
 */
export class DlxManifest {
  private readonly manifestPath: string
  private readonly lockPath: string

  constructor(options: DlxManifestOptions = {}) {
    this.manifestPath =
      options.manifestPath ??
      getPath().join(getSocketDlxDir(), MANIFEST_FILE_NAME)
    this.lockPath = `${this.manifestPath}.lock`
  }

  /**
   * Read the entire manifest file.
   */
  private readManifest(): Record<string, ManifestEntry | StoreRecord> {
    try {
      if (!getFs().existsSync(this.manifestPath)) {
        return Object.create(null)
      }

      const rawContent = readFileUtf8Sync(this.manifestPath)
      const content = (
        typeof rawContent === 'string'
          ? rawContent
          : rawContent.toString('utf8')
      ).trim()

      if (!content) {
        return Object.create(null)
      }

      return JSON.parse(content) as Record<string, ManifestEntry | StoreRecord>
    } catch (error) {
      logger.warn(
        `Failed to read manifest: ${error instanceof Error ? error.message : String(error)}`,
      )
      return Object.create(null)
    }
  }

  /**
   * Get a manifest entry by spec (e.g., "@socketsecurity/cli@^2.0.11").
   */
  getManifestEntry(spec: string): ManifestEntry | undefined {
    const data = this.readManifest()
    const entry = data[spec]

    // Check if it's a new-format entry (has 'type' field).
    if (entry && 'type' in entry) {
      return entry as ManifestEntry
    }

    return undefined
  }

  /**
   * Get cached update information for a package (legacy format).
   * @deprecated Use getManifestEntry() for new code.
   */
  get(name: string): StoreRecord | undefined {
    const data = this.readManifest()
    const entry = data[name]

    // Return legacy format entries only.
    if (entry && !('type' in entry)) {
      return entry as StoreRecord
    }

    return undefined
  }

  /**
   * Set a package manifest entry.
   */
  async setPackageEntry(
    spec: string,
    cacheKey: string,
    details: PackageDetails,
  ): Promise<void> {
    await processLock.withLock(this.lockPath, async () => {
      const data = this.readManifest()

      data[spec] = {
        type: 'package',
        cache_key: cacheKey,
        timestamp: Date.now(),
        details,
      }

      await this.writeManifest(data)
    })
  }

  /**
   * Set a binary manifest entry.
   */
  async setBinaryEntry(
    spec: string,
    cacheKey: string,
    details: BinaryDetails,
  ): Promise<void> {
    await processLock.withLock(this.lockPath, async () => {
      const data = this.readManifest()

      data[spec] = {
        type: 'binary',
        cache_key: cacheKey,
        timestamp: Date.now(),
        details,
      }

      await this.writeManifest(data)
    })
  }

  /**
   * Write the manifest file atomically.
   */
  private async writeManifest(
    data: Record<string, ManifestEntry | StoreRecord>,
  ): Promise<void> {
    // Ensure directory exists.
    const manifestDir = getPath().dirname(this.manifestPath)
    try {
      safeMkdirSync(manifestDir, { recursive: true })
    } catch (error) {
      logger.warn(
        `Failed to create manifest directory: ${error instanceof Error ? error.message : String(error)}`,
      )
    }

    // Write atomically.
    const content = JSON.stringify(data, null, 2)
    const tempPath = `${this.manifestPath}.tmp`

    try {
      getFs().writeFileSync(tempPath, content, 'utf8')
      getFs().writeFileSync(this.manifestPath, content, 'utf8')

      // Clean up temp file.
      try {
        if (getFs().existsSync(tempPath)) {
          getFs().unlinkSync(tempPath)
        }
      } catch {
        // Cleanup failed, not critical.
      }
    } catch (error) {
      // Clean up temp file on error.
      try {
        if (getFs().existsSync(tempPath)) {
          getFs().unlinkSync(tempPath)
        }
      } catch {
        // Best effort cleanup.
      }
      throw error
    }
  }

  /**
   * Store update information for a package (legacy format).
   * @deprecated Use setPackageEntry() for new code.
   */
  async set(name: string, record: StoreRecord): Promise<void> {
    await processLock.withLock(this.lockPath, async () => {
      let data: Record<string, StoreRecord> = Object.create(null)

      // Read existing data.
      try {
        if (getFs().existsSync(this.manifestPath)) {
          const content = getFs().readFileSync(this.manifestPath, 'utf8')
          if (content.trim()) {
            data = JSON.parse(content) as Record<string, StoreRecord>
          }
        }
      } catch (error) {
        logger.warn(
          `Failed to read existing manifest: ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      // Update record.
      data[name] = record

      // Ensure directory exists.
      const manifestDir = getPath().dirname(this.manifestPath)
      try {
        safeMkdirSync(manifestDir, { recursive: true })
      } catch (error) {
        logger.warn(
          `Failed to create manifest directory: ${error instanceof Error ? error.message : String(error)}`,
        )
      }

      // Write atomically.
      const content = JSON.stringify(data, null, 2)
      const tempPath = `${this.manifestPath}.tmp`

      try {
        getFs().writeFileSync(tempPath, content, 'utf8')
        getFs().writeFileSync(this.manifestPath, content, 'utf8')

        // Clean up temp file.
        try {
          if (getFs().existsSync(tempPath)) {
            getFs().unlinkSync(tempPath)
          }
        } catch {
          // Cleanup failed, not critical.
        }
      } catch (error) {
        // Clean up temp file on error.
        try {
          if (getFs().existsSync(tempPath)) {
            getFs().unlinkSync(tempPath)
          }
        } catch {
          // Best effort cleanup.
        }
        throw error
      }
    })
  }

  /**
   * Clear cached data for a specific entry.
   */
  async clear(name: string): Promise<void> {
    await processLock.withLock(this.lockPath, async () => {
      try {
        if (!getFs().existsSync(this.manifestPath)) {
          return
        }

        const content = getFs().readFileSync(this.manifestPath, 'utf8')
        if (!content.trim()) {
          return
        }

        const data = JSON.parse(content) as Record<string, StoreRecord>
        delete data[name]

        const updatedContent = JSON.stringify(data, null, 2)
        getFs().writeFileSync(this.manifestPath, updatedContent, 'utf8')
      } catch (error) {
        logger.warn(
          `Failed to clear cache for ${name}: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    })
  }

  /**
   * Clear all cached data.
   */
  async clearAll(): Promise<void> {
    await processLock.withLock(this.lockPath, async () => {
      try {
        if (getFs().existsSync(this.manifestPath)) {
          getFs().unlinkSync(this.manifestPath)
        }
      } catch (error) {
        logger.warn(
          `Failed to clear all cache: ${error instanceof Error ? error.message : String(error)}`,
        )
      }
    })
  }

  /**
   * Check if cached data is fresh based on TTL.
   */
  isFresh(record: StoreRecord | undefined, ttlMs: number): boolean {
    if (!record) {
      return false
    }

    const age = Date.now() - record.timestampFetch
    return age < ttlMs
  }

  /**
   * Get all cached package names.
   */
  getAllPackages(): string[] {
    try {
      if (!getFs().existsSync(this.manifestPath)) {
        return []
      }

      const rawContent = readFileUtf8Sync(this.manifestPath)
      const content = (
        typeof rawContent === 'string'
          ? rawContent
          : rawContent.toString('utf8')
      ).trim()
      if (!content) {
        return []
      }

      const data = JSON.parse(content) as Record<string, StoreRecord>
      return Object.keys(data)
    } catch (error) {
      logger.warn(
        `Failed to get package list: ${error instanceof Error ? error.message : String(error)}`,
      )
      return []
    }
  }
}
// Export singleton instance using default manifest location.
export const dlxManifest = new DlxManifest()
